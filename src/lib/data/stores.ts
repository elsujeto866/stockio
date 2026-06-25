import type { SupabaseClient } from '@supabase/supabase-js';

export interface Store {
  id: string;
  tenant_id: string;
  nombre: string;
  contacto: string | null;
  direccion: string | null;
  telefono: string | null;
  created_at: string;
}

/**
 * Returns all stores for the authenticated user's tenant.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 */
export async function getStores(supabase: SupabaseClient): Promise<Store[]> {
  const { data, error } = await supabase
    .from('stores')
    .select('id, tenant_id, nombre, contacto, direccion, telefono, created_at')
    .order('nombre');

  if (error) throw error;
  return (data ?? []) as Store[];
}
