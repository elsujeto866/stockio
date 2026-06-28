-- Migration: rewrite create_purchase (lot creation per line) + cancel_purchase (lot guard).
-- Depends on: 20260627100000_expiry_lots_schema.sql, 20260627100100_expiry_lots_backfill.sql
--
-- Design decision D2: create_purchase signature UNCHANGED — {uuid, jsonb, date, text}.
-- The jsonb item shape gains an optional "expiry_date" field (per-line operator override).
-- EXECUTE grant preserved via CREATE OR REPLACE.
--
-- Invariant maintained: SUM(lots.quantity) = stock_actual for all (tenant, product) pairs
-- because lot.quantity == purchase line cantidad and stock increment == cantidad.

-- ---------------------------------------------------------------------------
-- RPC: create_purchase (rewrite — adds lot per line item)
-- ---------------------------------------------------------------------------
create or replace function public.create_purchase(
  p_supplier_id uuid,
  p_items       jsonb,
  p_fecha       date    default current_date,
  p_notas       text    default null
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_tenant_id   uuid;
  v_purchase_id uuid;
  v_item        jsonb;
  v_stock       integer;
  v_shelf       integer;    -- shelf_life_days from product
  v_fecha       date;       -- effective received date
  v_expiry      date;       -- computed or overridden expiry
begin
  -- 1. Derive tenant from session
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  -- 2. Validate supplier belongs to tenant and is active
  if not exists (
    select 1
    from public.suppliers
    where id = p_supplier_id
      and tenant_id = v_tenant_id
      and activo = true
  ) then
    raise exception 'Supplier % not found in tenant', p_supplier_id;
  end if;

  -- 3. Effective received date (coalesce here so we reuse in lot row)
  v_fecha := coalesce(p_fecha, current_date);

  -- 4. Insert purchase header
  insert into public.purchases (tenant_id, supplier_id, fecha, estado, notas)
  values (v_tenant_id, p_supplier_id, v_fecha, 'recibido', p_notas)
  returning id into v_purchase_id;

  -- 5. Loop over items: lock product, read shelf_life_days, insert item + lot, increment stock
  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Lock product row; read stock and shelf_life_days in one query (D2)
    select stock_actual, shelf_life_days
      into v_stock, v_shelf
    from public.products
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id
    for update;

    if v_stock is null then
      raise exception 'Product % not found in tenant', v_item->>'product_id';
    end if;

    -- Expiry date priority (REQ-1):
    --   1. Per-line operator override (expiry_date key present and non-empty in item jsonb)
    --   2. shelf_life_days set → received_date + shelf_life_days
    --   3. shelf_life_days null and no override → NULL (not an error)
    v_expiry := coalesce(
      nullif(v_item->>'expiry_date', '')::date,
      case when v_shelf is not null then v_fecha + v_shelf else null end
    );

    -- Insert purchase line
    insert into public.purchase_items (purchase_id, tenant_id, product_id, cantidad, costo_unitario)
    values (
      v_purchase_id,
      v_tenant_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'cantidad')::integer,
      (v_item->>'costo_unitario')::numeric(12,2)
    );

    -- Insert lot (REQ-1: one lot per purchase line, invariant: lot.quantity == cantidad)
    insert into public.lots
      (tenant_id, product_id, purchase_id, lot_type, quantity, received_date, expiry_date)
    values
      (v_tenant_id,
       (v_item->>'product_id')::uuid,
       v_purchase_id,
       'purchase',
       (v_item->>'cantidad')::integer,
       v_fecha,
       v_expiry);

    -- Increment stock (same quantity — invariant preserved)
    update public.products
    set stock_actual = stock_actual + (v_item->>'cantidad')::integer
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id;
  end loop;

  -- 6. Compute and persist purchase total
  update public.purchases
  set total = (
    select coalesce(sum(subtotal), 0)
    from public.purchase_items
    where purchase_id = v_purchase_id
  )
  where id = v_purchase_id;

  return v_purchase_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel_purchase (rewrite — guards against partially-consumed lots)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_purchase(
  p_purchase_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_estado    text;
  v_chk       record;
begin
  -- 1. Derive tenant
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  -- 2. Lock the purchase row and read estado
  select estado into v_estado
  from public.purchases
  where id = p_purchase_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Purchase % not found in tenant', p_purchase_id;
  end if;

  -- 3. Guard state machine
  if v_estado <> 'recibido' then
    raise exception 'Only received purchases can be cancelled (current estado: %)', v_estado;
  end if;

  -- 4. PRE-CHECK (D5): verify all purchase lots are still intact (not yet consumed by orders).
  --    For each product in this purchase: sum(purchase_items.cantidad) vs sum(lots.quantity).
  --    If any lot has been partially consumed, remaining < added → reject.
  for v_chk in
    select
      pi.product_id,
      sum(pi.cantidad)                                        as added,
      coalesce(
        (select sum(l.quantity)
         from public.lots l
         where l.purchase_id = p_purchase_id
           and l.product_id = pi.product_id),
        0
      )                                                       as remaining
    from public.purchase_items pi
    where pi.purchase_id = p_purchase_id
    group by pi.product_id
  loop
    if v_chk.remaining < v_chk.added then
      raise exception
        'Cannot cancel purchase: product % already partially/fully sold (added %, remaining %)',
        v_chk.product_id, v_chk.added, v_chk.remaining;
    end if;
  end loop;

  -- 5. Lock product rows for mutation
  perform 1
  from public.products p
  join public.purchase_items pi on pi.product_id = p.id
  where pi.purchase_id = p_purchase_id
    and p.tenant_id = v_tenant_id
  for update of p;

  -- 6. MUTATION: subtract each purchase lot's remaining quantity from stock_actual, zero the lots.
  update public.products p
  set stock_actual = p.stock_actual - sub.q
  from (
    select product_id, sum(quantity) as q
    from public.lots
    where purchase_id = p_purchase_id
    group by product_id
  ) sub
  where sub.product_id = p.id
    and p.tenant_id = v_tenant_id;

  update public.lots
  set quantity = 0
  where purchase_id = p_purchase_id;

  -- 7. Mark purchase as cancelled
  update public.purchases
  set estado = 'cancelado'
  where id = p_purchase_id
    and tenant_id = v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- EXECUTE grants (preserved by CREATE OR REPLACE — explicit for clarity)
-- ---------------------------------------------------------------------------
grant execute on function public.create_purchase(uuid, jsonb, date, text) to authenticated;
grant execute on function public.cancel_purchase(uuid) to authenticated;
