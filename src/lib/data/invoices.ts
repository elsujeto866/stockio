import type { SupabaseClient } from '@supabase/supabase-js';

export interface Invoice {
  id: string;
  tenant_id: string;
  order_id: string;
  numero: number;
  fecha_emision: string;
  total: number;
  estado_pago: string | null;
  created_at: string;
}

/**
 * Returns all invoices for the authenticated user's tenant.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 */
export async function getInvoices(supabase: SupabaseClient): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, tenant_id, order_id, numero, fecha_emision, total, estado_pago, created_at'
    )
    .order('numero', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Invoice[];
}
