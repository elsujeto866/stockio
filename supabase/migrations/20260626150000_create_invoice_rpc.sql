-- WU-A: create_invoice(p_order_id uuid) SECURITY DEFINER RPC
--
-- Atomic invoice creation. Derives tenant from the caller's session via
-- get_tenant_id() — cannot be supplied or spoofed by the client.
--
-- Parameter shape: create_invoice(p_order_id uuid) -> uuid (the new invoice id)
--
-- Algorithm (all in one transaction):
--   1. Resolve caller's tenant_id from session (tamper-proof)
--   2. SELECT ... FOR UPDATE on the orders row (lock + read estado + total)
--   3. Guard: order must exist in tenant
--   4. Guard: estado must not be 'cancelado'
--   5. Guard: no existing invoice for this order
--   6. Allocate next invoice number via next_invoice_number() (same txn — gapless)
--   7. INSERT invoices RETURNING id
--
-- Gapless guarantee: next_invoice_number() participates in this transaction.
-- If the INSERT fails (or a RAISE fires before it), the whole txn rolls back
-- including the counter increment — no gap is created.
--
-- RAISE messages (exact — used for action error mapping via substring match):
--   'Not authenticated or profile not found'
--   'Order % not found in tenant'
--   'Cancelled orders cannot be invoiced'
--   'Invoice already exists for order %'
--
-- Note: fecha_emision is a date column; now() is cast to date on insert.
-- Note: unique(order_id) on invoices is the safety-net backstop; the EXISTS
--       pre-check above yields a clear human-readable message.

create or replace function public.create_invoice(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id  uuid;
  v_estado     text;
  v_total      numeric(14,2);
  v_numero     integer;
  v_invoice_id uuid;
begin
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  select estado, total into v_estado, v_total
  from public.orders
  where id = p_order_id and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Order % not found in tenant', p_order_id;
  end if;

  if v_estado = 'cancelado' then
    raise exception 'Cancelled orders cannot be invoiced';
  end if;

  if exists (select 1 from public.invoices where order_id = p_order_id) then
    raise exception 'Invoice already exists for order %', p_order_id;
  end if;

  v_numero := public.next_invoice_number(v_tenant_id);

  insert into public.invoices
    (tenant_id, order_id, numero, fecha_emision, total, estado_pago)
  values (
    v_tenant_id, p_order_id, v_numero, now(),
    coalesce(v_total,
      (select coalesce(sum(subtotal), 0) from public.order_items where order_id = p_order_id)),
    null
  )
  returning id into v_invoice_id;

  return v_invoice_id;
end;
$$;

grant execute on function public.create_invoice(uuid) to authenticated;
