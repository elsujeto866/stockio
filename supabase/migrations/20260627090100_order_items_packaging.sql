-- Slice 2: Add packaging columns to order_items and rewrite create_order / cancel_order RPCs.
--
-- Additive only (never edits previously-applied migrations).
-- Preserves:
--   subtotal GENERATED column (precio_unitario * cantidad) — untouched
--   FOR UPDATE row-lock serialization
--   tenant_id RLS scoping
--   existing INSUFFICIENT_STOCK_RE message format — available/requested stay in base units
--   All existing GRANTs (CREATE OR REPLACE preserves them)
--
-- PG-safety note: base_units references only plain columns (sale_unit, cantidad,
-- units_per_package_snapshot). subtotal references only plain columns (precio_unitario,
-- cantidad). Multiple STORED generated columns are permitted when each references
-- only non-generated columns — this satisfies that constraint.

-- ---------------------------------------------------------------------------
-- 1. New columns on order_items
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column sale_unit text not null default 'unit'
    check (sale_unit in ('unit', 'package')),
  add column units_per_package_snapshot integer not null default 1
    check (units_per_package_snapshot >= 1),
  add column base_units integer
    generated always as (
      case when sale_unit = 'package'
           then cantidad * units_per_package_snapshot
           else cantidad
      end
    ) stored;

-- ---------------------------------------------------------------------------
-- 2. Rewrite create_order RPC
--    p_items item shape: {product_id, cantidad, sale_unit}  (sale_unit optional, defaults 'unit')
--    Preserves GRANTs via CREATE OR REPLACE.
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
    -- Back-compat default: items omitting sale_unit are treated as 'unit'.
    v_sale_unit := coalesce(v_item->>'sale_unit', 'unit');
    v_cantidad  := (v_item->>'cantidad')::integer;

    -- Lock product row; read both prices + pack size + stock in one query.
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
      -- Explicit NULL guards: never compute NULL math and silently corrupt stock.
      if v_upp is null or v_upp < 2 then
        raise exception
          'Product % is not sold by package (units_per_package invalid)',
          v_item->>'product_id';
      end if;
      if v_precio_paca is null then
        raise exception
          'Product % has no package price (precio_paca is null)',
          v_item->>'product_id';
      end if;
      -- Freeze pack price; snapshot pack size; compute base units.
      v_price    := v_precio_paca;
      v_snapshot := v_upp;
      v_base     := v_cantidad * v_upp;
    else
      -- Unit sale: use catalog unit price; snapshot = 1; base = cantidad.
      -- v_price is already loaded from precio_unitario above.
      v_snapshot := 1;
      v_base     := v_cantidad;
    end if;

    -- Stock check in BASE units.
    -- IMPORTANT: message format is kept identical to the previous version
    -- so INSUFFICIENT_STOCK_RE in actions.ts parses it without any change.
    -- available and requested are both base units (internally consistent).
    if v_stock < v_base then
      raise exception
        'Insufficient stock for product %: available %, requested %',
        v_item->>'product_id', v_stock, v_base;
    end if;

    insert into public.order_items
      (order_id, tenant_id, product_id, cantidad,
       precio_unitario, sale_unit, units_per_package_snapshot)
    values
      (v_order_id, v_tenant_id, (v_item->>'product_id')::uuid, v_cantidad,
       v_price, v_sale_unit, v_snapshot);
    -- base_units and subtotal are GENERATED columns — not supplied here.

    update public.products
    set stock_actual = stock_actual - v_base
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id;
  end loop;

  -- Set authoritative order total (sum of frozen subtotals).
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
-- 3. Rewrite cancel_order RPC
--    TOP correctness requirement: restore stock_actual += oi.base_units, NOT oi.cantidad.
--    base_units is GENERATED STORED — its value is always consistent with the
--    sale_unit and snapshot captured at order creation time.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_estado    text;
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

  -- Restore stock in BASE units (REQ-5 — the highest-priority correctness requirement).
  -- For package lines: base_units = cantidad * units_per_package_snapshot (e.g. 2 packs × 30 = 60).
  -- For unit lines:    base_units = cantidad (unchanged from previous behaviour).
  update public.products p
  set stock_actual = p.stock_actual + oi.base_units
  from public.order_items oi
  where oi.order_id    = p_order_id
    and oi.product_id  = p.id
    and p.tenant_id    = v_tenant_id;

  update public.orders
  set estado = 'cancelado'
  where id = p_order_id
    and tenant_id = v_tenant_id;
end;
$$;
