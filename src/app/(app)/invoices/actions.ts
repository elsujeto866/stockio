'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { CreateInvoiceSchema } from '@/lib/schema/invoices';
import { RecordPaymentSchema } from '@/lib/schema/payments';
import { createInvoice } from '@/lib/data/invoices';
import {
  recordPayment,
  OverpaymentError,
  CancelledOrderPaymentError,
  InvalidPaymentAmountError,
  InvoiceNotFoundError,
} from '@/lib/data/payments';

/**
 * Shared return type for actions that use useActionState.
 *
 * null  → no error yet (initial state / after redirect)
 * {...} → validation or runtime error to display in the form
 */
export type ActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

// ---------------------------------------------------------------------------
// createInvoiceAction — useActionState signature
// ---------------------------------------------------------------------------
export async function createInvoiceAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const orderId = formData.get('orderId') as string | null;

  const parsed = CreateInvoiceSchema.safeParse({ orderId });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  let invoiceId: string;
  try {
    invoiceId = await createInvoice(supabase, parsed.data.orderId);
  } catch (err) {
    const msg = (err as { message?: string }).message ?? String(err);

    if (msg.includes('Cancelled orders cannot be invoiced')) {
      return { error: 'Los pedidos cancelados no se pueden facturar' };
    }
    if (msg.includes('Invoice already exists')) {
      return { error: 'Ya existe una factura para este pedido' };
    }
    if (msg.includes('not found')) {
      return { error: 'Pedido no encontrado.' };
    }
    return { error: msg };
  }

  revalidatePath('/invoices');
  redirect(`/invoices/${invoiceId}`);
}

// ---------------------------------------------------------------------------
// recordPaymentAction — AR-T20 (replaces the retired setPaymentStatusAction)
//
// Single write path for total_paid / estado_pago — delegates to
// the record_payment SECURITY DEFINER RPC via the payments data layer.
// ---------------------------------------------------------------------------
export async function recordPaymentAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const raw = {
    invoiceId: formData.get('invoiceId') as string | null,
    amount: formData.get('amount') as string | null,
    fecha: formData.get('fecha') as string | null,
    notas: formData.get('notas') as string | null,
  };

  const parsed = RecordPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { invoiceId, amount, fecha, notas } = parsed.data;

  try {
    await recordPayment(supabase, { invoiceId, amount, fecha, notas });
  } catch (err) {
    if (err instanceof OverpaymentError) {
      return { error: 'El abono excede el saldo pendiente de la factura.' };
    }
    if (err instanceof CancelledOrderPaymentError) {
      return { error: 'No se puede registrar un pago en un pedido cancelado.' };
    }
    if (err instanceof InvalidPaymentAmountError) {
      return { error: 'El monto del abono debe ser mayor a cero.' };
    }
    if (err instanceof InvoiceNotFoundError) {
      return { error: 'Factura no encontrada.' };
    }
    const msg = (err as { message?: string }).message ?? String(err);
    return { error: msg };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}`);
}
