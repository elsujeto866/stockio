import type { SupabaseClient } from '@supabase/supabase-js';

export interface OrderItem {
  id: string;
  order_id: string;
  tenant_id: string;
  product_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface Order {
  id: string;
  tenant_id: string;
  store_id: string;
  fecha: string;
  estado: 'pendiente' | 'entregado' | 'cancelado';
  total: number | null;
  notas: string | null;
  created_at: string;
}

export interface CreateOrderInput {
  storeId: string;
  items: Array<{ productId: string; cantidad: number }>;
  notas?: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all orders for the authenticated user's tenant.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 */
export async function getOrders(supabase: SupabaseClient): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, tenant_id, store_id, fecha, estado, total, notas, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Order[];
}

// ---------------------------------------------------------------------------
// RPC wrappers
//
// These are thin typed wrappers around the SECURITY DEFINER RPCs.
// They are injectable (take a supabase client), making them unit-testable
// with createMockSupabaseClient() without any real DB.
// ---------------------------------------------------------------------------

/**
 * Creates an order atomically via the create_order() RPC.
 *
 * The RPC derives the tenant from the caller's session — the client
 * does NOT supply a tenant_id (it would be ignored / tamper-proof).
 *
 * RPC parameter shape (Postgres):
 *   create_order(p_store_id uuid, p_items jsonb, p_notas text) -> uuid
 *
 * @returns The UUID of the newly created order.
 * @throws If the store is not found, any product has insufficient stock,
 *         or the user is not authenticated.
 */
export async function createOrder(
  supabase: SupabaseClient,
  input: CreateOrderInput
): Promise<string> {
  const { data, error } = await supabase.rpc('create_order', {
    p_store_id: input.storeId,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      cantidad: item.cantidad,
    })),
    p_notas: input.notas ?? null,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Cancels a pending order via the cancel_order() RPC.
 *
 * Restores stock for each line and sets estado to 'cancelado'.
 * Only 'pendiente' orders can be cancelled — the RPC raises otherwise.
 *
 * RPC parameter shape (Postgres):
 *   cancel_order(p_order_id uuid) -> void
 *
 * @throws If the order is not found, belongs to a different tenant,
 *         or is not in 'pendiente' estado.
 */
export async function cancelOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { error } = await supabase.rpc('cancel_order', {
    p_order_id: orderId,
  });

  if (error) throw error;
}

/**
 * Returns the next invoice number for the given tenant via the
 * next_invoice_number() RPC.
 *
 * The counter is gapless within a tenant and independent across tenants.
 * Participates in the caller's transaction — rolls back with a failed
 * invoice INSERT, preserving the gapless invariant.
 *
 * RPC parameter shape (Postgres):
 *   next_invoice_number(p_tenant_id uuid) -> integer
 *
 * @returns The next sequential invoice number for the tenant (starts at 1).
 */
export async function nextInvoiceNumber(
  supabase: SupabaseClient,
  tenantId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('next_invoice_number', {
    p_tenant_id: tenantId,
  });

  if (error) throw error;
  return data as number;
}
