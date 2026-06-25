import type { SupabaseClient } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  tenant_id: string;
  nombre: string | null;
  rol: 'admin' | 'operador';
  created_at: string;
}

/**
 * Returns the profile for the currently authenticated user.
 * Returns null if the user has no profile (should not happen in production).
 *
 * Inject a Supabase client — never import one here.
 * In tests, pass createMockSupabaseClient(); in RSC/actions, pass createClient().
 */
export async function getCurrentProfile(
  supabase: SupabaseClient
): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, tenant_id, nombre, rol, created_at')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;

  return data as Profile;
}
