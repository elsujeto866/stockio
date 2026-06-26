import type { SupabaseClient } from '@supabase/supabase-js';

export interface Store {
  id: string;
  tenant_id: string;
  nombre: string;
  contacto: string | null;
  direccion: string | null;
  telefono: string | null;
  activo: boolean;
  created_at: string;
}

/**
 * Input shape for createStore and updateStore.
 * No tenant_id — RLS get_tenant_id() default fills it server-side.
 */
export interface StoreInput {
  nombre: string;
  contacto?: string | null;
  direccion?: string | null;
  telefono?: string | null;
}

// ---------------------------------------------------------------------------
// Column list — shared by all queries and mutations to avoid drift
// ---------------------------------------------------------------------------
const SELECT_COLS =
  'id, tenant_id, nombre, contacto, direccion, telefono, activo, created_at';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all active stores for the authenticated user's tenant.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 */
export async function getStores(supabase: SupabaseClient): Promise<Store[]> {
  const { data, error } = await supabase
    .from('stores')
    .select(SELECT_COLS)
    .eq('activo', true)
    .order('nombre');

  if (error) throw error;
  return (data ?? []) as Store[];
}

/**
 * Returns a single store by id, or null if not found / RLS blocks access.
 */
export async function getStore(
  supabase: SupabaseClient,
  id: string
): Promise<Store | null> {
  const { data, error } = await supabase
    .from('stores')
    .select(SELECT_COLS)
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Store;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Creates a new store.
 *
 * tenant_id is NOT accepted from user input. It is resolved server-side
 * by calling the SECURITY DEFINER get_tenant_id() RPC, which reads the
 * authenticated user's profile row. This makes tenant spoofing impossible.
 */
export async function createStore(
  supabase: SupabaseClient,
  input: StoreInput
): Promise<Store> {
  const { data: tenantId, error: tenantErr } = await supabase.rpc('get_tenant_id');
  if (tenantErr || !tenantId) throw new Error('Could not resolve tenant: not authenticated');

  const { data, error } = await supabase
    .from('stores')
    .insert({ ...input, tenant_id: tenantId as string })
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return data as Store;
}

/**
 * Updates an existing store owned by the authenticated tenant.
 * RLS ensures cross-tenant edits are blocked at the DB level.
 */
export async function updateStore(
  supabase: SupabaseClient,
  id: string,
  input: StoreInput
): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .update(input)
    .eq('id', id)
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return data as Store;
}

/**
 * Soft-deletes a store by setting activo = false.
 * NEVER issues a hard DELETE — orders reference stores by FK.
 * RLS ensures only the owner's stores are affected.
 */
export async function deleteStore(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update({ activo: false })
    .eq('id', id);

  if (error) throw error;
}
