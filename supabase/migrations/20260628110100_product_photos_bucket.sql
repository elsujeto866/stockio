-- Product Photos: create private bucket and tenant-isolation RLS policy.
-- Design D5: bucket created via migration (not config.toml) for reproducibility.
-- Design D6: single FOR ALL policy on storage.objects — highest-risk piece,
--            retired by integration tests (PP-T25/PP-T26).
--
-- Down:
--   drop policy "product_photos_tenant_isolation" on storage.objects;
--   delete from storage.objects where bucket_id = 'product-photos';
--   delete from storage.buckets where id = 'product-photos';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-photos',
  'product-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase.
-- This policy is additive: no prior in-repo Storage RLS precedent.
create policy "product_photos_tenant_isolation"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'product-photos'
  and (storage.foldername(name))[1] = (select public.get_tenant_id())::text
)
with check (
  bucket_id = 'product-photos'
  and (storage.foldername(name))[1] = (select public.get_tenant_id())::text
);
