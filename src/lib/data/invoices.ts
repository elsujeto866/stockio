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
  /** Date when payment is due (fecha_emision + store.payment_terms_days). May be null for pre-migration rows. */
  due_date: string | null;
  /** Sum of all recorded payments for this invoice (maintained by record_payment RPC). */
  total_paid: number;
  // ── SRI fiscal snapshot (WU4/WU5) — all nullable for backward compat ──
  /** IVA base = round(total/1.15, 2). NULL on pre-SRI invoices. */
  subtotal_base_imponible: number | null;
  /** IVA 15% = total - subtotal_base_imponible. NULL on pre-SRI invoices. */
  valor_iva: number | null;
  /** Buyer fiscal type code ('04'=RUC,'05'=Cédula,'06'=Pasaporte,'07'=ConsumidorFinal,'08'=Exterior). */
  comprador_tipo_identificacion: string | null;
  /** Buyer fiscal ID number snapshotted at emit time. */
  comprador_numero_identificacion: string | null;
  /** Buyer legal name snapshotted at emit time. */
  comprador_razon_social: string | null;
  /** Emisor RUC snapshotted from tenants.ruc at emit time. */
  emisor_ruc: string | null;
  /** Emisor legal name snapshotted from tenants.nombre at emit time. */
  emisor_razon_social: string | null;
  /** Emisor establishment code snapshotted from tenants.estab at emit time. */
  emisor_estab: string | null;
  /** Emisor emission point snapshotted from tenants.pto_emi at emit time. */
  emisor_pto_emi: string | null;
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
      'id, tenant_id, order_id, numero, fecha_emision, total, estado_pago, created_at, due_date, total_paid, order:orders(store:stores(nombre))'
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
  // SRI fiscal snapshot cols are included here (ADR D5 — comprobante is the sole consumer).
  // Single string literal (no + concatenation) required for Supabase type-level column inference.
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, tenant_id, order_id, numero, fecha_emision, total, estado_pago, created_at, due_date, total_paid, subtotal_base_imponible, valor_iva, comprador_tipo_identificacion, comprador_numero_identificacion, comprador_razon_social, emisor_ruc, emisor_razon_social, emisor_estab, emisor_pto_emi, order:orders(id, fecha, total, notas, store:stores(nombre), items:order_items(id, product_id, cantidad, precio_unitario, subtotal, product:products(nombre)))'
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
    .select('id, tenant_id, order_id, numero, fecha_emision, total, estado_pago, created_at, due_date, total_paid')
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

// ---------------------------------------------------------------------------
// AR-T12 — getReceivableInvoices (REQ-3, REQ-4, REQ-6)
// ---------------------------------------------------------------------------

/**
 * Shape returned by getReceivableInvoices — includes store name for grouping.
 */
export interface ReceivableInvoice extends Invoice {
  order: {
    estado: string;
    store: { id: string; nombre: string } | null;
  } | null;
}

/**
 * Returns all non-cancelled-order invoices for the tenant, including
 * due_date and total_paid, joined with their store name.
 *
 * Used by /receivables overview and aging bucket computation.
 * RLS enforces tenant scoping — no explicit tenant filter needed.
 */
export async function getReceivableInvoices(
  supabase: SupabaseClient
): Promise<ReceivableInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, tenant_id, order_id, numero, fecha_emision, total, estado_pago, created_at, due_date, total_paid, ' +
        'order:orders(estado, store:stores(id, nombre))'
    )
    .neq('order.estado', 'cancelado')
    .order('fecha_emision', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ReceivableInvoice[];
}
