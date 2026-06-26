'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { CreateOrderSchema } from '@/lib/schema/orders';
import { createOrder, markDelivered, cancelOrder } from '@/lib/data/orders';

/**
 * Shared return type for createOrderAction (useActionState).
 * Extends the base shape with insufficientStock for stock-error UX.
 *
 * null  → no error yet (initial state / after redirect)
 * {...} → validation or runtime error to display in the form
 */
export type ActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  insufficientStock?: {
    productId: string;
    available: number;
    requested: number;
  };
} | null;

/**
 * Matches the RPC RAISE message:
 *   "Insufficient stock for product <uuid>: available <n>, requested <m>"
 *
 * Groups: [1] productId  [2] available  [3] requested
 */
const INSUFFICIENT_STOCK_RE =
  /Insufficient stock for product ([0-9a-f-]+): available (\d+), requested (\d+)/i;

// ---------------------------------------------------------------------------
// createOrderAction — useActionState signature
// ---------------------------------------------------------------------------
export async function createOrderAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  // 1. Defensively parse the hidden JSON items field.
  //    The client serialises lineItems[] as JSON.stringify(lineItems).
  let items: unknown;
  try {
    items = JSON.parse(formData.get('items') as string);
  } catch {
    return { error: 'Invalid order items' };
  }

  // 2. Zod schema validation.
  const storeId = formData.get('storeId') as string | null;
  const notas = formData.get('notas') as string | null;

  const parsed = CreateOrderSchema.safeParse({ storeId, items, notas });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // 3. Call the data seam.
  let orderId: string;
  try {
    orderId = await createOrder(supabase, {
      storeId: parsed.data.storeId,
      items: parsed.data.items.map((item) => ({
        productId: item.productId,
        cantidad: item.cantidad,
      })),
      notas: parsed.data.notas ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const match = INSUFFICIENT_STOCK_RE.exec(msg);
    if (match) {
      return {
        insufficientStock: {
          productId: match[1],
          available: parseInt(match[2], 10),
          requested: parseInt(match[3], 10),
        },
      };
    }
    return { error: msg || 'Failed to create order' };
  }

  revalidatePath('/orders');
  redirect(`/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// markDeliveredAction — plain form action (no useActionState needed)
// ---------------------------------------------------------------------------
export async function markDeliveredAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  if (!id) return;

  await markDelivered(supabase, id);

  revalidatePath('/orders');
  revalidatePath(`/orders/${id}`);
  redirect(`/orders/${id}`);
}

// ---------------------------------------------------------------------------
// cancelOrderAction — plain form action (no useActionState needed)
// ---------------------------------------------------------------------------
export async function cancelOrderAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  if (!id) return;

  await cancelOrder(supabase, id);

  revalidatePath('/orders');
  revalidatePath(`/orders/${id}`);
  redirect(`/orders/${id}`);
}
