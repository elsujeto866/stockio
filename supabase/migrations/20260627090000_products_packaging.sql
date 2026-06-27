-- Migration: add packaging columns to products.
-- NULL = unit-only product (backfill default for all existing rows).
-- No backfill SQL needed: both columns are nullable, so every existing row
-- is valid as-is.

alter table public.products
  add column units_per_package integer
    check (units_per_package is null or units_per_package >= 2),
  add column precio_paca numeric(12,2)
    check (precio_paca is null or precio_paca >= 0);

-- A pack price is meaningless without a pack size.
alter table public.products
  add constraint products_precio_paca_requires_pack
    check (precio_paca is null or units_per_package is not null);
