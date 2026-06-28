-- Migration: rewrite create_order (FEFO lot consumption) + cancel_order (A2 restore lot).
-- Depends on: 20260627100000_expiry_lots_schema.sql, 20260627100200_create_purchase_lots.sql
--
-- Additive: CREATE OR REPLACE preserves existing GRANTs.
--
-- Key changes to create_order:
--   - After stock check passes, FEFO-consumes lots (expiry_date ASC NULLS LAST) per line item.
--   - Zero-qty lots are KEPT (D4) — filtered by quantity > 0 for future reads.
--   - If lots exhausted before remaining_need = 0 → defensive raise (stock check is primary gate).
--
-- Key changes to cancel_order:
--   - Instead of a single bulk UPDATE to products, loop per order item.
--   - Insert one 'restore' lot per item (lot_type='restore', expiry_date=NULL, purchase_id=NULL).
--   - Restore base_units from order_items (preserves packaging units fix from 090100 migration).

-- ---------------------------------------------------------------------------
-- RPC: create_order (FEFO rewrite)
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_store_id uuid,
  p_items    jsonb,
  p_notas    text default null
) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant_id   uuid;
  v_order_id    uuid;
  v_item        jsonb;
  v_sale_unit   text;
  v_price       numeric(12,2);
  v_stock       integer;
  v_upp         integer;
  v_precio_paca numeric(12,2);
  v_snapshot    integer;
  v_base        integer;
  v_cantidad    integer;
  v_need        integer;
  v_take        integer;
  v_lot         record;
begin
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  if not exists (
    select 1 from public.stores
    where id = p_store_id and tenant_id = v_tenant_id
  ) then
    raise exception 'Store % not found in tenant', p_store_id;
  end if;

  insert into public.orders (tenant_id, store_id, estado, notas)
  values (v_tenant_id, p_store_id, 'pendiente', p_notas)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sale_unit := coalesce(v_item->>'sale_unit', 'unit');
    v_cantidad  := (v_item->>'cantidad')::integer;

    -- Lock product row; read prices + pack size + stock (same as pre-existing version)
    select precio_unitario, precio_paca, units_per_package, stock_actual
      into v_price, v_precio_paca, v_upp, v_stock
    from public.products
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id
    for update;

    if v_stock is null then
      raise exception 'Product % not found in tenant', v_item->>'product_id';
    end if;

    if v_sale_unit = 'package' then
      if v_upp is null or v_upp < 2 then
        raise exception 'Product % is not sold by package (units_per_package invalid)', v_item->>'product_id';
      end if;
      if v_precio_paca is null then
        raise exception 'Product % has no package price (precio_paca is null)', v_item->>'product_id';
      end if;
      v_price    := v_precio_paca;
      v_snapshot := v_upp;
      v_base     := v_cantidad * v_upp;
    else
      v_snapshot := 1;
      v_base     := v_cantidad;
    end if;

    -- Stock check in base units (message format kept identical — INSUFFICIENT_STOCK_RE parses it)
    if v_stock < v_base then
      raise exception
        'Insufficient stock for product %: available %, requested %',
        v_item->>'product_id', v_stock, v_base;
    end if;

    insert into public.order_items
      (order_id, tenant_id, product_id, cantidad, precio_unitario, sale_unit, units_per_package_snapshot)
    values
      (v_order_id, v_tenant_id, (v_item->>'product_id')::uuid, v_cantidad,
       v_price, v_sale_unit, v_snapshot);

    -- FEFO consumption: consume lots ordered by expiry_date ASC NULLS LAST (REQ-2)
    -- Product is already FOR UPDATE-locked above, so lot sums are stable during the loop.
    v_need := v_base;
    for v_lot in
      select id, quantity
      from public.lots
      where tenant_id = v_tenant_id
        and product_id = (v_item->>'product_id')::uuid
        and quantity > 0
      order by expiry_date asc nulls last, received_date asc, created_at asc
      for update
    loop
      exit when v_need <= 0;
      v_take := least(v_lot.quantity, v_need);
      update public.lots set quantity = quantity - v_take where id = v_lot.id;
      v_need := v_need - v_take;
    end loop;

    -- Defensive guard: should not reach here if stock_actual == SUM(lots.quantity)
    if v_need > 0 then
      raise exception
        'Insufficient stock for product %: available %, requested %',
        v_item->>'product_id', v_base - v_need, v_base;
    end if;

    -- Decrement stock_actual (invariant maintained: -= v_base)
    update public.products
    set stock_actual = stock_actual - v_base
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id;
  end loop;

  -- Authoritative order total
  update public.orders
  set total = (
    select coalesce(sum(subtotal), 0)
    from public.order_items
    where order_id = v_order_id
  )
  where id = v_order_id;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel_order (A2 restore lot per item)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_estado    text;
  v_item      record;
begin
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  select estado
  into v_estado
  from public.orders
  where id = p_order_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Order % not found in tenant', p_order_id;
  end if;

  if v_estado <> 'pendiente' then
    raise exception
      'Only pending orders can be cancelled (current estado: %)', v_estado;
  end if;

  -- A2 restore strategy: one restore lot per order item (REQ-3).
  -- Restore lots use base_units (packaging-aware) with NULL expiry → FEFO NULLS LAST.
  for v_item in
    select product_id, base_units
    from public.order_items
    where order_id = p_order_id
  loop
    insert into public.lots
      (tenant_id, product_id, purchase_id, lot_type, quantity, received_date, expiry_date)
    values
      (v_tenant_id, v_item.product_id, null, 'restore', v_item.base_units, current_date, null);

    update public.products
    set stock_actual = stock_actual + v_item.base_units
    where id = v_item.product_id
      and tenant_id = v_tenant_id;
  end loop;

  update public.orders
  set estado = 'cancelado'
  where id = p_order_id
    and tenant_id = v_tenant_id;
end;
$$;
