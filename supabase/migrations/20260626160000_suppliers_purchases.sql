-- Slice A: suppliers table + index + RLS + GRANT
-- Slice B will APPEND purchases + purchase_items + RPCs to this same file.

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  nombre      text        not null,
  ruc         text,
  contacto    text,
  telefono    text,
  email       text,
  notas       text,
  activo      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index idx_suppliers_tenant on public.suppliers(tenant_id);

alter table public.suppliers enable row level security;

grant select, insert, update, delete on public.suppliers to authenticated;

create policy suppliers_isolation on public.suppliers for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));
