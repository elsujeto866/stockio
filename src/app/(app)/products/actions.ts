'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { ProductInputSchema, StockAdjustSchema } from '@/lib/schema/products';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  StockUnderflowError,
} from '@/lib/data/products';

/**
 * Shared return type for actions that use useActionState.
 * null  → no error yet (initial state / after redirect)
 * {...} → validation or runtime error to display in the form
 */
export type ActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

// ---------------------------------------------------------------------------
// createProductAction — useActionState signature
// ---------------------------------------------------------------------------
export async function createProductAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const parsed = ProductInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await createProduct(supabase, parsed.data);
  } catch (err) {
    return { error: (err as { message?: string }).message ?? String(err) };
  }

  revalidatePath('/products');
  redirect('/products');
}

// ---------------------------------------------------------------------------
// updateProductAction — useActionState signature
// ---------------------------------------------------------------------------
export async function updateProductAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  if (!id) return { error: 'Product ID is required' };

  const parsed = ProductInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await updateProduct(supabase, id, parsed.data);
  } catch (err) {
    return { error: (err as { message?: string }).message ?? String(err) };
  }

  revalidatePath('/products');
  redirect('/products');
}

// ---------------------------------------------------------------------------
// deleteProductAction — plain form action (no useActionState needed)
// ---------------------------------------------------------------------------
export async function deleteProductAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  if (!id) return;

  await deleteProduct(supabase, id);

  revalidatePath('/products');
  redirect('/products');
}

// ---------------------------------------------------------------------------
// adjustStockAction — useActionState signature
// ---------------------------------------------------------------------------
export async function adjustStockAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const productId = formData.get('productId') as string | null;
  if (!productId) return { error: 'Product ID is required' };

  const parsed = StockAdjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await adjustStock(supabase, productId, parsed.data.delta);
  } catch (err) {
    if (err instanceof StockUnderflowError) {
      return { error: 'Stock cannot go below zero' };
    }
    return { error: (err as { message?: string }).message ?? String(err) };
  }

  revalidatePath('/products');
  redirect('/products');
}
