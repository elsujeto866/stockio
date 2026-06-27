'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { SupplierInputSchema } from '@/lib/schema/suppliers';
import { createSupplier, updateSupplier, deactivateSupplier } from '@/lib/data/suppliers';

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
// createSupplierAction — useActionState signature
// ---------------------------------------------------------------------------
export async function createSupplierAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const parsed = SupplierInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await createSupplier(supabase, parsed.data);
  } catch (err) {
    return { error: (err as { message?: string }).message ?? String(err) };
  }

  revalidatePath('/suppliers');
  redirect('/suppliers');
}

// ---------------------------------------------------------------------------
// updateSupplierAction — useActionState signature
// ---------------------------------------------------------------------------
export async function updateSupplierAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  if (!id) return { error: 'Supplier ID is required' };

  const parsed = SupplierInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await updateSupplier(supabase, id, parsed.data);
  } catch (err) {
    return { error: (err as { message?: string }).message ?? String(err) };
  }

  revalidatePath('/suppliers');
  redirect('/suppliers');
}

// ---------------------------------------------------------------------------
// deactivateSupplierAction — plain form action (no useActionState needed)
// ---------------------------------------------------------------------------
export async function deactivateSupplierAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  if (!id) return;

  await deactivateSupplier(supabase, id);

  revalidatePath('/suppliers');
  redirect('/suppliers');
}
