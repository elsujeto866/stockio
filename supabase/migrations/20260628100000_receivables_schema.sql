-- AR-T1: Receivables schema migration
-- Adds payment_terms_days to stores, due_date + total_paid to invoices,
-- creates the payments ledger table with RLS + SELECT-only grant.
-- Covers: REQ-1, REQ-9

alter table public.stores
  add column payment_terms_days integer not null default 30 check (payment_terms_days >= 0);

alter table public.invoices
  add column due_date   date,
  add column total_paid numeric(14,2) not null default 0 check (total_paid >= 0);

create table public.payments (
  id         uuid          primary key default gen_random_uuid(),
  tenant_id  uuid          not null references public.tenants(id) on delete cascade,
  invoice_id uuid          not null references public.invoices(id),
  amount     numeric(14,2) not null check (amount > 0),
  fecha      date          not null default current_date,
  notas      text,
  created_at timestamptz   not null default now()
);

create index idx_payments_tenant  on public.payments(tenant_id);
create index idx_payments_invoice on public.payments(tenant_id, invoice_id);

alter table public.payments enable row level security;

-- D1: SELECT only — all writes go through the record_payment SECURITY DEFINER RPC
grant select on public.payments to authenticated;

create policy payments_isolation on public.payments for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));
