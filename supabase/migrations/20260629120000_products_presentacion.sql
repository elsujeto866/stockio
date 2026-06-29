-- Product Catalog: add nullable presentacion (gramaje, e.g. "70 g", "22g x6").
-- Nullable, additive, no backfill — every existing row is valid as-is (NULL = unset).
-- Down: alter table public.products drop column presentacion;
alter table public.products add column presentacion text;
