import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
 * Invoice row extended with the order's store name for list views.
 * The nested select `order:orders(store:stores(nombre))` populates this.
 */
export interface InvoiceListItem extends Invoice {
  order: { store: { nombre: string } | null } | null;
}

/**
 * Full invoice detail with nested order, store, and frozen line items.
 * Used for the comprobante page.
 */
export interface InvoiceDetail extends Invoice {
  order: {
    id: string;
    fecha: string;
    total: number | null;
    notas: string | null;
    store: { nombre: string } | null;
    items: Array<{
      id: string;
      product_id: string;
      cantidad: number;
      precio_unitario: number;
      subtotal: number;
      product: { nombre: string } | null;
    }>;
  } | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all invoices for the authenticated user's tenant, ordered by numero DESC.
 * Includes the order's store name via PostgREST nested select.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 */
export async function getInvoices(supabase: SupabaseClient): Promise<InvoiceListItem[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, tenant_id, order_id, numero, fecha_emision, total, estado_pago, created_at, order:orders(store:stores(nombre))'
    )
    .order('numero', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as InvoiceListItem[];
}

/**
 * Returns a single invoice with full nested detail (order, store, line items, product names),
 * or null if not found or RLS blocks access.
 *
 * Uses PostgREST nested select (4-level: invoice → order → store/items → product).
 */
export async function getInvoice(
  supabase: SupabaseClient,
  id: string
): Promise<InvoiceDetail | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, tenant_id, order_id, numero, fecha_emision, total, estado_pago, created_at, ' +
        'order:orders(id, fecha, total, notas, store:stores(nombre), items:order_items(id, product_id, cantidad, precio_unitario, subtotal, product:products(nombre)))'
    )
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as unknown as InvoiceDetail;
}

/**
 * Returns the invoice for a given order, or null if none exists or RLS blocks access.
 * Used to check whether an order has already been invoiced (e.g., to show/hide the
 * "Generate invoice" form on the order detail page).
 */
export async function getInvoiceByOrderId(
  supabase: SupabaseClient,
  orderId: string
): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, tenant_id, order_id, numero, fecha_emision, total, estado_pago, created_at')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) return null;
  return data as Invoice | null;
}

// ---------------------------------------------------------------------------
// RPC wrappers
// ---------------------------------------------------------------------------

/**
 * Creates an invoice atomically via the create_invoice() RPC.
 *
 * The RPC derives the tenant from the caller's session — the client
 * does NOT supply a tenant_id (it would be ignored / tamper-proof).
 * Counter increment and INSERT are in the same transaction (gapless).
 *
 * RPC parameter shape (Postgres):
 *   create_invoice(p_order_id uuid) -> uuid
 *
 * @returns The UUID of the newly created invoice.
 * @throws If the order is not found, already invoiced, cancelled,
 *         or the user is not authenticated.
 */
export async function createInvoice(
  supabase: SupabaseClient,
  orderId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('create_invoice', {
    p_order_id: orderId,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Sets the payment status of an invoice.
 *
 * @param estado 'pendiente' | 'pagado' | null — null clears the status
 * @throws If the update fails (e.g., invoice not found or RLS blocks access).
 */
export async function setInvoicePaymentStatus(
  supabase: SupabaseClient,
  id: string,
  estado: 'pendiente' | 'pagado' | null
): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ estado_pago: estado })
    .eq('id', id);

  if (error) throw error;
}
