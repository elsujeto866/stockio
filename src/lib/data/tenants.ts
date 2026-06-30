import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantEmisorInput } from '@/lib/schema/tenants';

/**
 * Emisor config shape returned by getTenantEmisor.
 * ruc is nullable — NULL means invoice emission is blocked (REQ-4a).
 */
export interface TenantEmisor {
  ruc: string | null;
  estab: string;
  pto_emi: string;
  nombre: string;
}

// Single string literal — no + concatenation (Supabase type-layer requirement).
const EMISOR_COLS = 'ruc, estab, pto_emi, nombre';

/**
 * Returns the emisor config for the currently authenticated user's tenant.
 *
 * Resolves the tenant via the get_tenant_id() SECURITY DEFINER RPC so that
 * the caller never needs to supply or validate a tenant ID.
 * RLS also enforces tenant scoping at the DB level.
 */
export async function getTenantEmisor(
  supabase: SupabaseClient
): Promise<TenantEmisor> {
  const { data: tenantId, error: tenantErr } = await supabase.rpc('get_tenant_id');
  if (tenantErr || !tenantId) {
    throw new Error('Could not resolve tenant: not authenticated');
  }

  const { data, error } = await supabase
    .from('tenants')
    .select(EMISOR_COLS)
    .eq('id', tenantId as string)
    .single();

  if (error) throw error;
  return data as TenantEmisor;
}

/**
 * Updates the emisor config (ruc, estab, pto_emi) for the currently
 * authenticated user's tenant.
 *
 * Resolves the tenant via get_tenant_id() — tenant spoofing is impossible.
 */
export async function updateTenantEmisor(
  supabase: SupabaseClient,
  input: TenantEmisorInput
): Promise<void> {
  const { data: tenantId, error: tenantErr } = await supabase.rpc('get_tenant_id');
  if (tenantErr || !tenantId) {
    throw new Error('Could not resolve tenant: not authenticated');
  }

  const { error } = await supabase
    .from('tenants')
    .update({ ruc: input.ruc, estab: input.estab, pto_emi: input.pto_emi })
    .eq('id', tenantId as string);

  if (error) throw error;
}
