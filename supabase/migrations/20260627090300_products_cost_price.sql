-- Migration: add nullable cost_price to products.
-- NULL = cost not set (default for all existing rows) → margin unknown, shown as "—".
-- No backfill SQL needed: the column is nullable, so every existing row is valid as-is.
-- cost_price is a deliberate manual REFERENCE cost; not auto-synced from purchases.

alter table public.products
  add column cost_price numeric(12,2)
    check (cost_price is null or cost_price >= 0);

-- Rollback: alter table public.products drop column cost_price;
