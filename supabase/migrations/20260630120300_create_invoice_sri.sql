-- WU4: extend create_invoice RPC with fiscal snapshot + IVA computation
--
-- Changes from 20260628100300_fix_create_invoice_due_date.sql:
--   1. Fetch tenant fiscal data (ruc, nombre, estab, pto_emi) — NULL ruc → RAISE EXCEPTION
--   2. Extend store JOIN to include fiscal fields (tipo_identificacion, numero_identificacion,
--      razon_social_comprobante, nombre)
--   3. Compute IVA backward (IVA-inclusive 15%):
--      v_base := round(v_total / 1.15, 2); v_iva := v_total - v_base
--   4. Buyer snapshot resolution:
--      if numero_identificacion IS NULL → consumidor final defaults
--      else → store values with razon = COALESCE(razon_social_comprobante, nombre)
--   5. INSERT 9 new cols: emisor_*(4) + comprador_*(3) + subtotal_base_imponible + valor_iva
--
-- REQ-4a: NULL-RUC guard fires BEFORE the counter is allocated.
--   No invoice row is inserted; gapless counter is not advanced.
--   Error message surfaces to the Server Action's existing try/catch.
--
-- All other guards (not authenticated, order not found, cancelled, duplicate) are preserved.

create or replace function public.create_invoice(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id    uuid;
  v_invoice_id   uuid;
  v_next_num     integer;
  v_total        numeric(14,2);
  v_due_date     date;
  -- Emisor (from tenants)
  v_ruc          text;
  v_razon        text;
  v_estab        text;
  v_pto          text;
  -- Buyer (from stores)
  v_tipo         text;
  v_num_id       text;
  v_razon_comp   text;
  v_store_nombre text;
  -- Resolved buyer snapshot
  v_comp_tipo    text;
  v_comp_num     text;
  v_comp_razon   text;
  -- IVA
  v_base         numeric(14,2);
  v_iva          numeric(14,2);
begin
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  -- Fetch tenant fiscal data and enforce NULL-RUC guard BEFORE allocating a numero.
  -- (REQ-4a: no counter increment on blocked emit)
  select ruc, nombre, estab, pto_emi
  into v_ruc, v_razon, v_estab, v_pto
  from public.tenants
  where id = v_tenant_id;

  if v_ruc is null then
    raise exception 'Tenant RUC not configured: set your RUC before emitting invoices';
  end if;

  -- Fetch order total + due_date, extending store join with fiscal fields.
  -- due_date anchored to current_date (= fecha_emision), NOT o.fecha (REQ-1).
  select
    o.total,
    (current_date + (coalesce(s.payment_terms_days, 30) || ' days')::interval)::date,
    s.tipo_identificacion,
    s.numero_identificacion,
    s.razon_social_comprobante,
    s.nombre
  into v_total, v_due_date, v_tipo, v_num_id, v_razon_comp, v_store_nombre
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

  -- IVA backward computation (total is IVA-inclusive at 15%)
  v_base := round(coalesce(v_total, 0) / 1.15, 2);
  v_iva  := coalesce(v_total, 0) - v_base;

  -- Buyer snapshot resolution
  if v_num_id is null then
    -- No specific buyer configured → consumidor final defaults
    v_comp_tipo  := '07';
    v_comp_num   := '9999999999999';
    v_comp_razon := 'CONSUMIDOR FINAL';
  else
    v_comp_tipo  := v_tipo;
    v_comp_num   := v_num_id;
    v_comp_razon := coalesce(v_razon_comp, v_store_nombre);
  end if;

  -- Gapless invoice counter (same txn — rollback on failure = no gap)
  insert into public.tenant_invoice_counters (tenant_id, last_number)
  values (v_tenant_id, 1)
  on conflict (tenant_id)
  do update set last_number = tenant_invoice_counters.last_number + 1
  returning last_number into v_next_num;

  -- Insert invoice with fiscal snapshot
  insert into public.invoices (
    tenant_id,
    order_id,
    numero,
    fecha_emision,
    total,
    estado_pago,
    due_date,
    subtotal_base_imponible,
    valor_iva,
    comprador_tipo_identificacion,
    comprador_numero_identificacion,
    comprador_razon_social,
    emisor_ruc,
    emisor_razon_social,
    emisor_estab,
    emisor_pto_emi
  )
  values (
    v_tenant_id,
    p_order_id,
    v_next_num,
    current_date,
    coalesce(v_total, 0),
    'pendiente',
    v_due_date,
    v_base,
    v_iva,
    v_comp_tipo,
    v_comp_num,
    v_comp_razon,
    v_ruc,
    v_razon,
    v_estab,
    v_pto
  )
  returning id into v_invoice_id;

  return v_invoice_id;
end;
$$;

-- grant is idempotent; preserves existing privilege from 20260626150000
grant execute on function public.create_invoice(uuid) to authenticated;
