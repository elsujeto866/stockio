-- W3 fix: anchor create_invoice due_date to fecha_emision (current_date), NOT order.fecha.
--
-- REQ-1 mandates: due_date = fecha_emision + payment_terms_days.
-- Migration 20260628100200 set due_date = o.fecha + terms, which produces the correct
-- result ONLY when the order and invoice are created on the same day.  An invoice issued
-- after its originating order (common in practice) would receive an EARLIER due_date than
-- the spec requires.
--
-- This migration corrects the anchor.  All other logic is unchanged from 20260628100200.

create or replace function public.create_invoice(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id  uuid;
  v_invoice_id uuid;
  v_next_num   integer;
  v_total      numeric(14,2);
  v_due_date   date;
begin
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  -- Fetch order total.
  -- due_date is anchored to current_date (= fecha_emision), NOT o.fecha (REQ-1).
  select
    o.total,
    (current_date + (coalesce(s.payment_terms_days, 30) || ' days')::interval)::date
  into v_total, v_due_date
  from public.orders o
  join public.stores s on s.id = o.store_id
  where o.id = p_order_id
    and o.tenant_id = v_tenant_id;

  if not found then
    raise exception 'Order % not found in tenant', p_order_id;
  end if;

  -- Guard: order must not be cancelled
  if exists (
    select 1 from public.orders
    where id = p_order_id and tenant_id = v_tenant_id and estado = 'cancelado'
  ) then
    raise exception 'Cancelled orders cannot be invoiced';
  end if;

  -- Guard: no duplicate invoice for the same order
  if exists (
    select 1 from public.invoices
    where order_id = p_order_id and tenant_id = v_tenant_id
  ) then
    raise exception 'Invoice already exists for order %', p_order_id;
  end if;

  -- Gapless invoice counter
  insert into public.tenant_invoice_counters (tenant_id, last_number)
  values (v_tenant_id, 1)
  on conflict (tenant_id)
  do update set last_number = tenant_invoice_counters.last_number + 1
  returning last_number into v_next_num;

  -- Insert invoice.  due_date = current_date + payment_terms_days (REQ-1).
  insert into public.invoices (tenant_id, order_id, numero, fecha_emision, total, estado_pago, due_date)
  values (
    v_tenant_id,
    p_order_id,
    v_next_num,
    current_date,
    coalesce(v_total, 0),
    'pendiente',
    v_due_date
  )
  returning id into v_invoice_id;

  return v_invoice_id;
end;
$$;

-- grant is idempotent; preserves existing privilege from 20260626150000
grant execute on function public.create_invoice(uuid) to authenticated;
