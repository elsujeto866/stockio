'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { CreateInvoiceSchema, SetPaymentSchema } from '@/lib/schema/invoices';
import { createInvoice, setInvoicePaymentStatus } from '@/lib/data/invoices';

/**
 * Shared return type for createInvoiceAction (useActionState).
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
    // Supabase throws PostgrestError (plain object, not Error instance).
    // Access .message directly before falling back to String(err).
    const msg = (err as { message?: string }).message ?? String(err);

    if (msg.includes('Cancelled orders cannot be invoiced')) {
      return { error: 'This order is cancelled and cannot be invoiced.' };
    }
    if (msg.includes('Invoice already exists')) {
      return { error: 'An invoice already exists for this order.' };
    }
    if (msg.includes('not found')) {
      return { error: 'Order not found.' };
    }
    return { error: msg };
  }

  revalidatePath('/invoices');
  redirect(`/invoices/${invoiceId}`);
}

// ---------------------------------------------------------------------------
// setPaymentStatusAction — plain form action (no useActionState needed)
// ---------------------------------------------------------------------------
export async function setPaymentStatusAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  const estadoRaw = formData.get('estado') as string | null;
  // Empty string is treated as null (clears status)
  const estado = estadoRaw === '' ? null : estadoRaw;

  const parsed = SetPaymentSchema.safeParse({ id, estado });
  if (!parsed.success) return;

  await setInvoicePaymentStatus(
    supabase,
    parsed.data.id,
    parsed.data.estado ?? null
  );

  revalidatePath(`/invoices/${parsed.data.id}`);
  redirect(`/invoices/${parsed.data.id}`);
}
