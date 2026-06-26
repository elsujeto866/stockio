-- WU-A: CREATE OR REPLACE create_order to persist orders.total after the item loop.
--
-- Changes vs. previous version (20260625211447_rls_rpcs.sql):
--   Adds after the item loop, before RETURN:
--     UPDATE public.orders
--     SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM public.order_items WHERE order_id = v_order_id)
--     WHERE id = v_order_id;
--
-- Insufficient-stock RAISE message (EXACT TEXT — WU-B1 regex must match this):
--   'Insufficient stock for product %: available %, requested %'
--   Interpolated example: 'Insufficient stock for product <uuid>: available 5, requested 10'
--   Regex: /Insufficient stock for product ([0-9a-f-]+): available (\d+), requested (\d+)/i
--
-- No re-GRANT needed — CREATE OR REPLACE preserves all existing GRANTs.
-- SECURITY DEFINER + SET search_path = '' are preserved exactly.

create or replace function public.create_order(
  p_store_id  uuid,
  p_items     jsonb,
  p_notas     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_order_id  uuid;
  v_item      jsonb;
  v_price     numeric(12,2);
  v_stock     integer;
begin
  -- Derive tenant from the authenticated session (tamper-proof)
  v_tenant_id := (select public.get_tenant_id());

  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  -- Validate that the store belongs to the caller's tenant
  if not exists (
    select 1
    from public.stores
    where id = p_store_id
      and tenant_id = v_tenant_id
  ) then
    raise exception 'Store % not found in tenant', p_store_id;
  end if;

  -- Insert order header
  insert into public.orders (tenant_id, store_id, estado, notas)
  values (v_tenant_id, p_store_id, 'pendiente', p_notas)
  returning id into v_order_id;

  -- Process each line item
  for v_item in select * from jsonb_array_elements(p_items) loop
    -- Lock the product row to serialize concurrent decrements (prevents oversell)
    select precio_unitario, stock_actual
    into v_price, v_stock
    from public.products
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id
    for update;

    if v_stock is null then
      raise exception 'Product % not found in tenant', v_item->>'product_id';
    end if;

    if v_stock < (v_item->>'cantidad')::integer then
      raise exception
        'Insufficient stock for product %: available %, requested %',
        v_item->>'product_id',
        v_stock,
        (v_item->>'cantidad')::integer;
    end if;

    -- Insert line with FROZEN precio_unitario (snapshot — subsequent catalog
    -- price changes do NOT affect existing order_item lines)
    insert into public.order_items
      (order_id, tenant_id, product_id, cantidad, precio_unitario)
    values (
      v_order_id,
      v_tenant_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'cantidad')::integer,
      v_price  -- frozen; subtotal is GENERATED ALWAYS AS (precio_unitario * cantidad) STORED
    );

    -- Decrement stock
    update public.products
    set stock_actual = stock_actual - (v_item->>'cantidad')::integer
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id;
  end loop;

  -- Set authoritative order total (sum of all line subtotals, frozen at creation time).
  -- Subtotals are GENERATED ALWAYS columns so they are already committed when we
  -- reach this UPDATE — no re-computation needed at the application layer.
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

-- Composite index for efficient per-tenant date-range scans (ORDER BY fecha DESC).
-- Covers getOrders(from, to) filter paths used by the order history page.
create index if not exists idx_orders_tenant_fecha
  on public.orders(tenant_id, fecha);
