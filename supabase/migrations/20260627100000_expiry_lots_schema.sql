-- Migration: lots table schema + product expiry columns
-- Part of Feature #4 (Lot Tracking + FEFO).
--
-- Additive only — no edits to prior migrations.
-- Delivery: direct to main. Apply manually via Supabase dashboard SQL editor.
--
-- Must be applied BEFORE: 100100_backfill, 100200_purchase_lots,
--                         100300_order_fefo, 100400_adjust_stock_rpc

-- ---------------------------------------------------------------------------
-- 1. New columns on products (additive — existing rows get sensible defaults)
-- ---------------------------------------------------------------------------
--   shelf_life_days:   NULL for all existing rows (no shelf life known yet).
--   expiry_alert_days: 30 for all existing rows (backfilled by DEFAULT).
alter table public.products
  add column shelf_life_days   integer check (shelf_life_days is null or shelf_life_days > 0),
  add column expiry_alert_days integer not null default 30 check (expiry_alert_days > 0);

-- ---------------------------------------------------------------------------
-- 2. lots table
-- ---------------------------------------------------------------------------
create table public.lots (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id) on delete cascade,
  product_id    uuid        not null references public.products(id),
  purchase_id   uuid        references public.purchases(id),          -- null for adjustment/restore
  lot_type      text        not null default 'purchase'
                  check (lot_type in ('purchase', 'adjustment', 'restore')),
  quantity      integer     not null check (quantity >= 0),
  received_date date        not null default current_date,
  expiry_date   date,                                                  -- null = unknown/no expiry
  batch_ref     text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Indices
-- ---------------------------------------------------------------------------
create index idx_lots_tenant on public.lots(tenant_id);

-- FEFO + alert query index: tenant scoping + product + expiry ordered together.
create index idx_lots_fefo on public.lots(tenant_id, product_id, expiry_date);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.lots enable row level security;

-- D1 (design): SELECT only granted to authenticated.
-- SECURITY DEFINER RPCs (owner-level) bypass grants and write lots directly.
-- No direct client write path to lots — prevents SUM(lots) != stock_actual drift.
grant select on public.lots to authenticated;

-- Policy mirrors the canonical pattern used by suppliers, purchases, order_items.
-- initPlan-wrapped form avoids per-row re-evaluation of get_tenant_id().
create policy lots_isolation on public.lots for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));

-- Rollback:
--   drop policy lots_isolation on public.lots;
--   revoke select on public.lots from authenticated;
--   drop table public.lots;
--   alter table public.products drop column shelf_life_days, drop column expiry_alert_days;
