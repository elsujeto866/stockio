-- WU4: RLS + get_tenant_id() + RPCs
--
-- Applies on top of 20260625193428_schema.sql (8 tables already exist).
-- This migration is the security heart of the app:
--   1. get_tenant_id() — SECURITY DEFINER resolver; called from every RLS policy
--   2. ENABLE ROW LEVEL SECURITY on all 8 tables
--   3. Isolation policies using the (SELECT get_tenant_id()) initPlan wrapper
--   4. Table-level GRANTs so the authenticated role can reach the tables
--   5. next_invoice_number(p_tenant_id) — gapless counter RPC
--   6. create_order(p_store_id, p_items, p_notas) — atomic stock-decrement + price-freeze RPC
--   7. cancel_order(p_order_id) — stock restore + estado flip RPC
--
-- NEVER edit 20260625193428_schema.sql (already applied). All changes ship here.

-- ---------------------------------------------------------------------------
-- 1. Tenant resolver (SECURITY DEFINER)
--
-- Returns the tenant_id for the currently authenticated user by reading the
-- profiles table. STABLE allows Postgres to call it once per statement
-- (initPlan) when wrapped in (SELECT ...) inside a policy USING clause.
-- SET search_path = '' prevents schema-injection on SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
create or replace function public.get_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenant_id
  from public.profiles
  where id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table public.tenants                 enable row level security;
alter table public.profiles                enable row level security;
alter table public.products                enable row level security;
alter table public.stores                  enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;
alter table public.invoices                enable row level security;
alter table public.tenant_invoice_counters enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Table-level GRANTs for the authenticated role
--
-- Supabase new projects revoke implicit public schema access.
-- These grants allow authenticated users to reach the tables;
-- RLS policies below then restrict which ROWS they can see/modify.
-- ---------------------------------------------------------------------------

-- tenants: read-only (users never create/delete tenants)
grant select on public.tenants to authenticated;

-- profiles: read own tenant members; update own row only (INSERT via provisioning only)
grant select, update on public.profiles to authenticated;

-- tenant data tables: full CRUD gated by RLS policies below
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.stores to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;

-- counters: read-only; writes happen only inside
-- the next_invoice_number() SECURITY DEFINER RPC which bypasses RLS
grant select on public.tenant_invoice_counters to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS policies
--
-- Pattern: (select public.get_tenant_id()) — the (SELECT ...) wrapper triggers
-- an initPlan so get_tenant_id() runs ONCE per statement, not once per row.
-- This is the critical performance optimization for large tables.
--
-- Every table gets an ALL policy (covers SELECT + INSERT + UPDATE + DELETE)
-- except where explicit split is needed (profiles, tenants, counters).
-- ---------------------------------------------------------------------------

-- tenants: a user sees only their own tenant row; no mutations allowed
create policy tenants_isolation on public.tenants
  for select
  using (id = (select public.get_tenant_id()));

-- profiles: select rows within same tenant; update own row only
create policy profiles_select on public.profiles
  for select
  using (tenant_id = (select public.get_tenant_id()));

create policy profiles_update on public.profiles
  for update
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and tenant_id = (select public.get_tenant_id())
  );

-- products: full CRUD scoped to tenant
create policy products_isolation on public.products
  for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));

-- stores: full CRUD scoped to tenant
create policy stores_isolation on public.stores
  for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));

-- orders: full CRUD scoped to tenant
create policy orders_isolation on public.orders
  for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));

-- order_items: full CRUD; uses DENORMALIZED tenant_id for O(1) policy scan
create policy order_items_isolation on public.order_items
  for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));

-- invoices: full CRUD scoped to tenant
create policy invoices_isolation on public.invoices
  for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));

-- tenant_invoice_counters: select only; writes happen only inside
-- the next_invoice_number() SECURITY DEFINER RPC which bypasses RLS
create policy counters_select on public.tenant_invoice_counters
  for select
  using (tenant_id = (select public.get_tenant_id()));

-- ---------------------------------------------------------------------------
-- 5. RPC — next_invoice_number(p_tenant_id uuid)
--
-- Upserts a counter row for the given tenant and returns the next number.
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING is atomic (takes exclusive
-- row lock on conflict). Participates in the caller's transaction — rolls back
-- with any failed surrounding INSERT, preserving gaplessness.
--
-- Parameter shape: next_invoice_number(p_tenant_id uuid) -> integer
-- Called by: invoice creation flows (operators / other RPCs)
-- ---------------------------------------------------------------------------
create or replace function public.next_invoice_number(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  insert into public.tenant_invoice_counters (tenant_id, last_number)
  values (p_tenant_id, 1)
  on conflict (tenant_id) do update
    set last_number = tenant_invoice_counters.last_number + 1
  returning last_number into v_number;

  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC — create_order(p_store_id, p_items, p_notas)
--
-- Atomic order creation. Derives tenant from the caller's session via
-- get_tenant_id() — cannot be supplied or spoofed by the client.
--
-- Parameter shape:
--   p_store_id  uuid      — must belong to the caller's tenant
--   p_items     jsonb     — array of {product_id: uuid, cantidad: integer}
--   p_notas     text      — optional order notes (default null)
-- Returns: uuid (the new order id)
--
-- Algorithm (all in one transaction):
--   1. Resolve caller's tenant_id from session (tamper-proof)
--   2. Validate p_store_id belongs to the tenant
--   3. INSERT order header (estado = 'pendiente')
--   4. For each item:
--      a. SELECT ... FOR UPDATE on the product row (prevents concurrent oversell)
--      b. Check stock >= cantidad — RAISE EXCEPTION if not
--      c. INSERT order_item with frozen precio_unitario snapshot
--      d. UPDATE products.stock_actual -= cantidad
-- ---------------------------------------------------------------------------
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

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC — cancel_order(p_order_id uuid)
--
-- Reverses the effect of create_order for a 'pendiente' order.
-- Derives tenant from session — cross-tenant cancellation is impossible.
--
-- Parameter shape: cancel_order(p_order_id uuid) -> void
--
-- Algorithm:
--   1. Lock order row FOR UPDATE; verify it belongs to caller's tenant
--   2. Guard: only 'pendiente' orders can be cancelled (raise otherwise)
--   3. Restore stock for each line in one batched UPDATE
--   4. Set estado = 'cancelado'
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_estado    text;
begin
  -- Derive tenant from the authenticated session
  v_tenant_id := (select public.get_tenant_id());

  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  -- Lock the order row and verify it belongs to the caller's tenant
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

  -- Restore stock for every line item in one batched UPDATE
  update public.products p
  set stock_actual = p.stock_actual + oi.cantidad
  from public.order_items oi
  where oi.order_id   = p_order_id
    and oi.product_id = p.id
    and p.tenant_id   = v_tenant_id;

  -- Flip estado to 'cancelado'
  update public.orders
  set estado = 'cancelado'
  where id = p_order_id
    and tenant_id = v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. EXECUTE grants for RPCs (authenticated role)
--
-- PostgreSQL grants EXECUTE to PUBLIC by default, but Supabase revokes this.
-- Explicit grants are required so authenticated users can call these RPCs.
-- ---------------------------------------------------------------------------
grant execute on function public.get_tenant_id() to authenticated;
grant execute on function public.next_invoice_number(uuid) to authenticated;
grant execute on function public.create_order(uuid, jsonb, text) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
