import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amount: number;
  fecha: string;
  notas: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Named error classes (D6)
// Mirrors OrderNotDeliverableError / StockUnderflowError pattern.
// Substring-matched against RPC RAISE messages (see record_payment RPC).
// ---------------------------------------------------------------------------

export class OverpaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverpaymentError';
  }
}

export class CancelledOrderPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancelledOrderPaymentError';
  }
}

export class InvalidPaymentAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaymentAmountError';
  }
}

export class InvoiceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// recordPayment
// ---------------------------------------------------------------------------

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  fecha?: string | null;
  notas?: string | null;
}

/**
 * Records a payment for an invoice via the record_payment SECURITY DEFINER RPC.
 *
 * All validation (overpayment, cancelled order, zero amount, tenant) is handled
 * inside the RPC. This function maps RAISE messages to named error classes.
 *
 * D5: The sole write path for total_paid and estado_pago.
 */
export async function recordPayment(
  supabase: SupabaseClient,
  input: RecordPaymentInput
): Promise<void> {
  const { error } = await supabase.rpc('record_payment', {
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_fecha: input.fecha ?? null,
    p_notas: input.notas ?? null,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('Payment exceeds outstanding balance')) {
      throw new OverpaymentError(msg);
    }
    if (msg.includes('Cannot record payment on a cancelled order')) {
      throw new CancelledOrderPaymentError(msg);
    }
    if (msg.includes('Payment amount must be greater than zero')) {
      throw new InvalidPaymentAmountError(msg);
    }
    if (msg.includes('not found in tenant')) {
      throw new InvoiceNotFoundError(msg);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// getPaymentsByInvoice
// ---------------------------------------------------------------------------

/**
 * Returns all payments for a given invoice, ordered by fecha ASC.
 * RLS enforces tenant scoping — no explicit tenant filter needed.
 */
export async function getPaymentsByInvoice(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, tenant_id, invoice_id, amount, fecha, notas, created_at')
    .eq('invoice_id', invoiceId)
    .order('fecha', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    invoiceId: row.invoice_id as string,
    amount: Number(row.amount),
    fecha: row.fecha as string,
    notas: (row.notas as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}
