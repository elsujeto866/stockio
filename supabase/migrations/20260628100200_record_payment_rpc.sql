-- AR-T3: record_payment RPC + update create_invoice to set due_date at creation time.
-- Covers: REQ-1/S1-1,S1-2; REQ-2/S2-1..S2-5; REQ-9

-- ---------------------------------------------------------------------------
-- (a) Patch create_invoice to set due_date = fecha_emision + payment_terms_days
--     Closes the spec-design gap: new invoices must inherit store terms at CREATE time.
-- ---------------------------------------------------------------------------
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

  -- Verify order exists in tenant and is not cancelled / already invoiced
  select
    o.total,
    (o.fecha + (coalesce(s.payment_terms_days, 30) || ' days')::interval)::date
  into v_total, v_due_date
  from public.orders o
  join public.stores s on s.id = o.store_id
  where o.id = p_order_id
    and o.tenant_id = v_tenant_id;

  if not found then
    raise exception 'Order % not found in tenant', p_order_id;
  end if;

  -- Check cancelled
  if exists (
    select 1 from public.orders
    where id = p_order_id and tenant_id = v_tenant_id and estado = 'cancelado'
  ) then
    raise exception 'Cancelled orders cannot be invoiced';
  end if;

  -- Check already invoiced
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

  -- Create invoice with due_date derived from store payment terms
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

-- ---------------------------------------------------------------------------
-- (b) record_payment RPC — sole write path for total_paid and estado_pago
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount     numeric,
  p_fecha      date    default current_date,
  p_notas      text    default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_total     numeric(14,2);
  v_paid      numeric(14,2);
  v_estado    text;
begin
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select i.total, i.total_paid, o.estado
  into v_total, v_paid, v_estado
  from public.invoices i
  join public.orders o on o.id = i.order_id
  where i.id = p_invoice_id
    and i.tenant_id = v_tenant_id
  for update of i;  -- lock invoice row; serializes concurrent abonos

  if not found then
    raise exception 'Invoice % not found in tenant', p_invoice_id;
  end if;

  if v_estado = 'cancelado' then
    raise exception 'Cannot record payment on a cancelled order';
  end if;

  if p_amount > (v_total - v_paid) then
    raise exception 'Payment exceeds outstanding balance: outstanding %, attempted %',
      v_total - v_paid, p_amount;
  end if;

  insert into public.payments (tenant_id, invoice_id, amount, fecha, notas)
  values (v_tenant_id, p_invoice_id, p_amount, coalesce(p_fecha, current_date), p_notas);

  update public.invoices
  set total_paid  = total_paid + p_amount,
      estado_pago = case
                      when total_paid + p_amount >= v_total then 'pagado'
                      else estado_pago
                    end
  where id = p_invoice_id;
end;
$$;

grant execute on function public.record_payment(uuid, numeric, date, text) to authenticated;
