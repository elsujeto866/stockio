-- Migration: idempotent backfill of existing stock into lots table.
-- Depends on: 20260627100000_expiry_lots_schema.sql
--
-- For each product where stock_actual > 0, creates exactly one 'adjustment' lot
-- with expiry_date = NULL (expiry unknown for pre-migration stock).
--
-- Products with stock_actual = 0 get no lot (invariant: 0 = 0 holds trivially).
--
-- NOT EXISTS guard makes this safe to re-run after real lots already exist;
-- a second execution inserts nothing if even one lot already exists for that product.
-- This prevents double-backfill if the migration is accidentally re-applied.
--
-- After this migration: SUM(lots.quantity) = stock_actual for all (tenant, product) pairs.

insert into public.lots (tenant_id, product_id, lot_type, quantity, received_date, expiry_date, purchase_id)
select
  p.tenant_id,
  p.id          as product_id,
  'adjustment'  as lot_type,
  p.stock_actual as quantity,
  current_date  as received_date,
  null          as expiry_date,
  null          as purchase_id
from public.products p
where p.stock_actual > 0
  and not exists (
    select 1
    from public.lots l
    where l.product_id = p.id
  );

-- Rollback (removes ALL lots — only safe before any RPC writes):
--   delete from public.lots;
