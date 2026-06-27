-- Enforce both-or-neither pairing for packaging fields.
--
-- The original constraint (20260627090000) only blocked precio_paca without
-- units_per_package. This migration makes it symmetric: a product must have
-- BOTH fields set or NEITHER set — a units_per_package without precio_paca
-- is now also rejected.
--
-- Safe to apply addively: the old constraint is dropped first, then the
-- symmetric one is added. No data loss — NULL/NULL rows remain valid.

alter table public.products
  drop constraint products_precio_paca_requires_pack;

alter table public.products
  add constraint products_pack_fields_both_or_neither
    check (
      (units_per_package is null and precio_paca is null)
      or
      (units_per_package is not null and precio_paca is not null)
    );
