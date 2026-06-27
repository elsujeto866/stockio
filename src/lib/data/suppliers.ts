import type { SupabaseClient } from '@supabase/supabase-js';

export interface Supplier {
  id: string;
  tenant_id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
}

/**
 * Input shape for createSupplier and updateSupplier.
 * No tenant_id — RLS get_tenant_id() default fills it server-side.
 */
export interface SupplierInput {
  nombre: string;
  ruc?: string | null;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  notas?: string | null;
}

// ---------------------------------------------------------------------------
// Column list — shared by all queries and mutations to avoid drift
// ---------------------------------------------------------------------------
const SELECT_COLS =
  'id, tenant_id, nombre, ruc, contacto, telefono, email, notas, activo, created_at';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all active suppliers for the authenticated user's tenant.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 */
export async function getSuppliers(supabase: SupabaseClient): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select(SELECT_COLS)
    .eq('activo', true)
    .order('nombre');

  if (error) throw error;
  return (data ?? []) as Supplier[];
}

/**
 * Returns a single supplier by id, or null if not found / RLS blocks access.
 */
export async function getSupplier(
  supabase: SupabaseClient,
  id: string
): Promise<Supplier | null> {
  const { data, error } = await supabase
    .from('suppliers')
    .select(SELECT_COLS)
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Supplier;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Creates a new supplier.
 *
 * tenant_id is NOT accepted from user input. It is resolved server-side
 * by calling the SECURITY DEFINER get_tenant_id() RPC, which reads the
 * authenticated user's profile row. This makes tenant spoofing impossible.
 */
export async function createSupplier(
  supabase: SupabaseClient,
  input: SupplierInput
): Promise<Supplier> {
  const { data: tenantId, error: tenantErr } = await supabase.rpc('get_tenant_id');
  if (tenantErr || !tenantId) throw new Error('Could not resolve tenant: not authenticated');

  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...input, tenant_id: tenantId as string })
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return data as Supplier;
}

/**
 * Updates an existing supplier owned by the authenticated tenant.
 * RLS ensures cross-tenant edits are blocked at the DB level.
 */
export async function updateSupplier(
  supabase: SupabaseClient,
  id: string,
  input: SupplierInput
): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update(input)
    .eq('id', id)
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return data as Supplier;
}

/**
 * Soft-deletes a supplier by setting activo = false.
 * NEVER issues a hard DELETE — purchases reference suppliers by FK (RESTRICT).
 * RLS ensures only the owner's suppliers are affected.
 */
export async function deactivateSupplier(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('suppliers')
    .update({ activo: false })
    .eq('id', id);

  if (error) throw error;
}
