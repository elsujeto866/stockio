-- Migration: new adjust_stock SECURITY DEFINER RPC.
-- Depends on: 20260627100000_expiry_lots_schema.sql (lots table + lots column on products)
--             20260627100300_create_order_fefo.sql  (lots are being written by RPCs now)
--
-- Returns: public.products row (D7 — single round-trip, caller does not re-fetch)
-- Invariant: SUM(lots.quantity) = stock_actual maintained inside each branch.

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_delta      integer
) returns public.products
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_stock     integer;
  v_need      integer;
  v_take      integer;
  v_lot       record;
  v_row       public.products;
begin
  -- 1. Derive tenant from session
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  -- 2. Lock product row and read current stock (product first — lock ordering)
  select stock_actual into v_stock
  from public.products
  where id = p_product_id
    and tenant_id = v_tenant_id
  for update;

  if v_stock is null then
    raise exception 'Product % not found in tenant', p_product_id;
  end if;

  if p_delta > 0 then
    -- Positive delta: create adjustment lot + increment stock_actual (REQ-5 S5-1)
    insert into public.lots
      (tenant_id, product_id, purchase_id, lot_type, quantity, received_date, expiry_date)
    values
      (v_tenant_id, p_product_id, null, 'adjustment', p_delta, current_date, null);

    update public.products
    set stock_actual = stock_actual + p_delta
    where id = p_product_id
      and tenant_id = v_tenant_id;

  elsif p_delta < 0 then
    -- Negative delta: FEFO consumption (REQ-5 S5-2)
    v_need := -p_delta;

    -- Pre-check: reject immediately if insufficient stock (D6: errcode 23514)
    if v_stock < v_need then
      raise exception 'Stock cannot go below zero'
        using errcode = '23514';
    end if;

    -- FEFO loop: consume lots from earliest expiry
    for v_lot in
      select id, quantity
      from public.lots
      where tenant_id = v_tenant_id
        and product_id = p_product_id
        and quantity > 0
      order by expiry_date asc nulls last, received_date asc, created_at asc
      for update
    loop
      exit when v_need <= 0;
      v_take := least(v_lot.quantity, v_need);
      update public.lots set quantity = quantity - v_take where id = v_lot.id;
      v_need := v_need - v_take;
    end loop;

    -- Decrement stock_actual (invariant: -= ABS(p_delta))
    update public.products
    set stock_actual = stock_actual + p_delta  -- p_delta is negative
    where id = p_product_id
      and tenant_id = v_tenant_id;

  end if;
  -- p_delta = 0: no-op (no lot, no stock change — return current row as-is)

  -- 3. Return the updated product row (D7)
  select * into v_row from public.products where id = p_product_id;
  return v_row;
end;
$$;

grant execute on function public.adjust_stock(uuid, integer) to authenticated;
