'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { StoreInputSchema } from '@/lib/schema/stores';
import { createStore, updateStore, deleteStore } from '@/lib/data/stores';

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
// createStoreAction — useActionState signature
// ---------------------------------------------------------------------------
export async function createStoreAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const parsed = StoreInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await createStore(supabase, parsed.data);
  } catch (err) {
    return { error: (err as { message?: string }).message ?? String(err) };
  }

  revalidatePath('/stores');
  redirect('/stores');
}

// ---------------------------------------------------------------------------
// updateStoreAction — useActionState signature
// ---------------------------------------------------------------------------
export async function updateStoreAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  if (!id) return { error: 'Store ID is required' };

  const parsed = StoreInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await updateStore(supabase, id, parsed.data);
  } catch (err) {
    return { error: (err as { message?: string }).message ?? String(err) };
  }

  revalidatePath('/stores');
  redirect('/stores');
}

// ---------------------------------------------------------------------------
// deleteStoreAction — plain form action (no useActionState needed)
// ---------------------------------------------------------------------------
export async function deleteStoreAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await requireUser();

  const id = formData.get('id') as string | null;
  if (!id) return;

  await deleteStore(supabase, id);

  revalidatePath('/stores');
  redirect('/stores');
}
