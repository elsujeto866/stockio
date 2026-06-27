'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { CreatePurchaseSchema } from '@/lib/schema/purchases';
import { createPurchase, cancelPurchase } from '@/lib/data/purchases';

/**
 * Shared return type for purchase actions (useActionState).
 * Extends base shape with negativeStock for cancel error UX.
 *
 * null  → no error yet (initial state / after redirect)
 * {...} → validation or runtime error to display
 */
export type ActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  negativeStock?: {
    productId: string;
    current: number;
    cantidad: number;
  };
} | null;

/**
 * Matches the cancel_purchase RAISE message:
 *   "Cannot cancel purchase: product <uuid> stock would go negative (current: <n>, purchase: <m>)"
 *
 * Groups: [1] productId  [2] current  [3] cantidad
 */
const NEGATIVE_STOCK_RE =
  /Cannot cancel purchase: product ([0-9a-f-]+) stock would go negative \(current: (\d+), purchase: (\d+)\)/i;

// ---------------------------------------------------------------------------
// createPurchaseAction — useActionState signature
// ---------------------------------------------------------------------------
export async function createPurchaseAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  // 1. Defensively parse the hidden JSON items field.
  let items: unknown;
  try {
    items = JSON.parse(formData.get('items') as string);
  } catch {
    return { error: 'Invalid purchase items' };
  }

  // 2. Zod schema validation.
  const supplierId = formData.get('supplierId') as string | null;
  const fecha = formData.get('fecha') as string | null;
  const notas = formData.get('notas') as string | null;

  const parsed = CreatePurchaseSchema.safeParse({ supplierId, fecha: fecha ?? undefined, items, notas });
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // 3. Call the data seam.
  let purchaseId: string;
  try {
    purchaseId = await createPurchase(supabase, {
      supplierId: parsed.data.supplierId,
      fecha: parsed.data.fecha,
      items: parsed.data.items.map((item) => ({
        productId: item.productId,
        cantidad: item.cantidad,
        costoUnitario: item.costoUnitario,
      })),
      notas: parsed.data.notas ?? undefined,
    });
  } catch (err) {
    const msg = (err as { message?: string }).message ?? String(err);
    return { error: msg || 'Failed to create purchase' };
  }

  revalidatePath('/purchases');
  redirect(`/purchases/${purchaseId}`);
}

// ---------------------------------------------------------------------------
// cancelPurchaseAction — useActionState signature
// ---------------------------------------------------------------------------
export async function cancelPurchaseAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  if (!id) return null;

  try {
    await cancelPurchase(supabase, id);
  } catch (err) {
    const msg = (err as { message?: string }).message ?? String(err);
    const match = NEGATIVE_STOCK_RE.exec(msg);
    if (match) {
      return {
        negativeStock: {
          productId: match[1],
          current: parseInt(match[2], 10),
          cantidad: parseInt(match[3], 10),
        },
      };
    }
    return { error: msg };
  }

  revalidatePath('/purchases');
  revalidatePath(`/purchases/${id}`);
  redirect(`/purchases/${id}`);
}
