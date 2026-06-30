'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { TenantEmisorSchema } from '@/lib/schema/tenants';
import { updateTenantEmisor } from '@/lib/data/tenants';

/**
 * Shared return type for updateEmisorAction (useActionState signature).
 * null  → no result yet (initial state)
 * {...} → validation/runtime error or success confirmation
 */
export type ActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
} | null;

// ---------------------------------------------------------------------------
// updateEmisorAction — useActionState signature
// ---------------------------------------------------------------------------
export async function updateEmisorAction(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  await requireUser();

  const parsed = TenantEmisorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await updateTenantEmisor(supabase, parsed.data);
  } catch (err) {
    return { error: (err as { message?: string }).message ?? String(err) };
  }

  revalidatePath('/settings/emisor');
  return { success: true };
}
