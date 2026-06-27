/**
 * Data seam for purchases (compras).
 *
 * Mirrors orders.ts but:
 *  - supplier_id (not store_id)
 *  - costo_unitario (not precio_unitario)
 *  - create_purchase / cancel_purchase RPCs (no markDelivered equivalent)
 *
 * Inject a Supabase client — never import one here.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  tenant_id: string;
  product_id: string;
  cantidad: number;
  costo_unitario: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  tenant_id: string;
  supplier_id: string;
  fecha: string;
  estado: 'recibido' | 'cancelado';
  total: number | null;
  notas: string | null;
  created_at: string;
}

/** purchase_item row joined with product.nombre for display. */
export interface PurchaseItemWithProduct {
  id: string;
  product_id: string;
  cantidad: number;
  costo_unitario: number;
  subtotal: number;
  product: { nombre: string } | null;
}

/** Purchase list row joined with supplier.nombre (avoids N+1). */
export interface PurchaseListItem extends Purchase {
  supplier: { nombre: string } | null;
}

/** Full purchase detail with nested supplier name and line items. */
export interface PurchaseDetail extends Purchase {
  supplier: { nombre: string } | null;
  items: PurchaseItemWithProduct[];
}

export interface CreatePurchaseInput {
  supplierId: string;
  fecha?: string;
  items: Array<{ productId: string; cantidad: number; costoUnitario: number }>;
  notas?: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all purchases for the authenticated tenant, newest first.
 * Optional filters: supplierId, from (fecha >=), to (fecha <=).
 */
export async function getPurchases(
  supabase: SupabaseClient,
  options?: { supplierId?: string; from?: string; to?: string; limit?: number }
): Promise<PurchaseListItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('purchases')
    .select(
      'id, tenant_id, supplier_id, fecha, estado, total, notas, created_at, supplier:suppliers(nombre)'
    )
    .order('created_at', { ascending: false });

  if (options?.supplierId) {
    query = query.eq('supplier_id', options.supplierId);
  }
  if (options?.from) {
    query = query.gte('fecha', options.from);
  }
  if (options?.to) {
    query = query.lte('fecha', options.to);
  }
  if (options?.limit !== undefined) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PurchaseListItem[];
}

/**
 * Returns a single purchase with supplier name and all line items
 * (including product names), or null if not found or RLS blocks access.
 */
export async function getPurchase(
  supabase: SupabaseClient,
  id: string
): Promise<PurchaseDetail | null> {
  const { data, error } = await supabase
    .from('purchases')
    .select(
      'id, tenant_id, supplier_id, fecha, estado, total, notas, created_at, ' +
      'supplier:suppliers(nombre), ' +
      'items:purchase_items(id, product_id, cantidad, costo_unitario, subtotal, product:products(nombre))'
    )
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as unknown as PurchaseDetail;
}

// ---------------------------------------------------------------------------
// RPC wrappers
// ---------------------------------------------------------------------------

/**
 * Creates a purchase atomically via the create_purchase() SECURITY DEFINER RPC.
 *
 * The RPC derives tenant from the caller's session — the client does NOT supply
 * a tenant_id. Increments stock_actual for each product; freezes costo_unitario
 * from user input (not the catalog price).
 *
 * camelCase → snake_case mapping happens here (single point of truth).
 *
 * @returns UUID of the newly created purchase.
 * @throws If the supplier is not found/active, any product is not found,
 *         or the caller is not authenticated.
 */
export async function createPurchase(
  supabase: SupabaseClient,
  input: CreatePurchaseInput
): Promise<string> {
  const { data, error } = await supabase.rpc('create_purchase', {
    p_supplier_id: input.supplierId,
    p_items: input.items.map((i) => ({
      product_id: i.productId,
      cantidad: i.cantidad,
      costo_unitario: i.costoUnitario,
    })),
    p_fecha: input.fecha ?? null,
    p_notas: input.notas ?? null,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Cancels a received purchase via the cancel_purchase() SECURITY DEFINER RPC.
 *
 * Only 'recibido' purchases can be cancelled. Raises a domain error if any
 * product's stock_actual would go negative (two-phase check).
 *
 * @throws Domain error with parseable message on negative-stock or wrong estado.
 */
export async function cancelPurchase(
  supabase: SupabaseClient,
  purchaseId: string
): Promise<void> {
  const { error } = await supabase.rpc('cancel_purchase', {
    p_purchase_id: purchaseId,
  });

  if (error) throw error;
}
