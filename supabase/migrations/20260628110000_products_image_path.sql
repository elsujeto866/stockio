-- Product Photos: add nullable image_path column.
-- REQ-1, REQ-6: nullable (no backfill); NULL = no photo.
-- Down: alter table public.products drop column image_path;

alter table public.products add column image_path text;
