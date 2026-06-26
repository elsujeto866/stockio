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

// ---------------------------------------------------------------------------
// Extended types for joined queries
// ---------------------------------------------------------------------------

/**
 * A single order_item row as returned by getOrder's nested select,
 * extended with the product's nombre for display.
 */
export interface OrderItemWithProduct {
  id: string;
  product_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  product: { nombre: string } | null;
}

/**
 * An order row extended with the store's nombre for list views (avoids N+1).
 */
export interface OrderListItem extends Order {
  store: { nombre: string } | null;
}

/**
 * Full order detail with nested store name and line items (including product names).
 */
export interface OrderDetail extends Order {
  store: { nombre: string } | null;
  items: OrderItemWithProduct[];
}

export interface CreateOrderInput {
  storeId: string;
  items: Array<{ productId: string; cantidad: number }>;
  notas?: string;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Thrown by markDelivered when the order is not in 'pendiente' estado,
 * is not found, or belongs to a different tenant (RLS blocks the update).
 *
 * Mirrors StockUnderflowError: named class, typed field, correct prototype chain.
 */
export class OrderNotDeliverableError extends Error {
  readonly orderId: string;

  constructor(orderId: string) {
    super(`Order ${orderId} cannot be delivered (not in pendiente estado or not found)`);
    this.name = 'OrderNotDeliverableError';
    this.orderId = orderId;
    // Maintain correct prototype chain in compiled JS
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all orders for the authenticated user's tenant, with optional filters.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 *
 * Backward-compatible: calling without options returns all orders (existing behaviour).
 *
 * @param options.storeId  Filter by store UUID (exact match).
 * @param options.from     Filter by fecha >= value (ISO date string, inclusive).
 * @param options.to       Filter by fecha <= value (ISO date string, inclusive).
 */
export async function getOrders(
  supabase: SupabaseClient,
  options?: { storeId?: string; from?: string; to?: string }
): Promise<OrderListItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('orders')
    .select('id, tenant_id, store_id, fecha, estado, total, notas, created_at, store:stores(nombre)')
    .order('created_at', { ascending: false });

  if (options?.storeId) {
    query = query.eq('store_id', options.storeId);
  }
  if (options?.from) {
    query = query.gte('fecha', options.from);
  }
  if (options?.to) {
    query = query.lte('fecha', options.to);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as OrderListItem[];
}

/**
 * Returns a single order with its store name and line items (including product names),
 * or null if the order is not found or RLS blocks access.
 *
 * Uses PostgREST nested select (table-shorthand `store:stores(nombre)` and
 * `product:products(nombre)`) — single FK per relation auto-resolves without
 * specifying FK names.
 */
export async function getOrder(
  supabase: SupabaseClient,
  id: string
): Promise<OrderDetail | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, tenant_id, store_id, fecha, estado, total, notas, created_at, ' +
      'store:stores(nombre), ' +
      'items:order_items(id, product_id, cantidad, precio_unitario, subtotal, product:products(nombre))'
    )
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as unknown as OrderDetail;
}

/**
 * Marks an order as 'entregado' using a conditional UPDATE that only affects
 * rows currently in 'pendiente' estado.
 *
 * If the order is already delivered, cancelled, belongs to a different tenant
 * (RLS), or does not exist — the UPDATE matches 0 rows and throws
 * OrderNotDeliverableError. No separate guard query is needed; the conditional
 * UPDATE is atomic.
 *
 * @throws OrderNotDeliverableError if the update does not return a row.
 */
export async function markDelivered(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { data, error } = await supabase
    .from('orders')
    .update({ estado: 'entregado' })
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select('id')
    .single();

  if (error || !data) {
    throw new OrderNotDeliverableError(id);
  }
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
