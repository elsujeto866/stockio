// @vitest-environment node
/**
 * WU-A Integration Tests — Orders Data Seam
 *
 * Covers:
 *   - total NOT NULL after create_order (RED until orchestrator applies migration)
 *   - getOrder: nested store+product names join
 *   - getOrder: cross-tenant isolation returns null
 *   - getOrders: storeId filter
 *   - getOrders: from/to date-range filters
 *   - markDelivered: flips estado to 'entregado'
 *   - markDelivered: rejects a non-pendiente order (throws OrderNotDeliverableError)
 *
 * Does NOT duplicate rpcs.test.ts coverage:
 *   - oversell block (tested there)
 *   - price freeze (tested there)
 *   - cancel_order + stock restore (tested there)
 *
 * STRICT TDD — RED PHASE for test "total NOT NULL after create_order":
 *   The migration 20260626120000_fix_create_order_total.sql has NOT been applied yet.
 *   create_order returns total = NULL → the total assertion FAILS → correct RED state.
 *   All other tests should PASS with the current DB state.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getOrder, getOrders, markDelivered, OrderNotDeliverableError } from '@/lib/data/orders';

// ---------------------------------------------------------------------------
// WebSocket stub — prevents real-time WS connections in test environment
// ---------------------------------------------------------------------------
class _NoopWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = _NoopWebSocket.CLOSED;
  constructor(_url: string, _protocols?: string | string[]) {
    super();
  }
  send(_data: unknown) {}
  close(_code?: number, _reason?: string) {}
}

// ---------------------------------------------------------------------------
// Unique suffix — prevents fixture collision across parallel test runs
// ---------------------------------------------------------------------------
const UNIQUE = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------
function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY');
  }
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });
}

function createBrowserStyleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });
}

// ---------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------
const admin = createAdminClient();
const PASSWORD = 'TestPass123!';

let tenantAId: string;
let tenantBId: string;

let userAId: string;
let userBId: string;
let userAEmail: string;
let userBEmail: string;

let clientA: SupabaseClient;
let clientB: SupabaseClient;

let storeAId: string;
let storeBId: string;   // second store in tenant A for filter tests
let productAId: string;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userAEmail = `orders-seam-a+${UNIQUE}@stockio.test`;
  userBEmail = `orders-seam-b+${UNIQUE}@stockio.test`;

  // Tenant A
  const { data: tA, error: tAErr } = await admin
    .from('tenants')
    .insert({ nombre: `__orders_seam_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (tAErr) throw new Error(`tenant A: ${tAErr.message}`);
  tenantAId = tA.id;

  // Tenant B (cross-tenant isolation tests)
  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__orders_seam_b_${UNIQUE}__` })
    .select('id')
    .single();
  if (tBErr) throw new Error(`tenant B: ${tBErr.message}`);
  tenantBId = tB.id;

  // Auth user A
  const { data: uA, error: uAErr } = await admin.auth.admin.createUser({
    email: userAEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uAErr) throw new Error(`user A: ${uAErr.message}`);
  userAId = uA.user.id;

  // Auth user B
  const { data: uB, error: uBErr } = await admin.auth.admin.createUser({
    email: userBEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uBErr) throw new Error(`user B: ${uBErr.message}`);
  userBId = uB.user.id;

  // Profile A
  const { error: pAErr } = await admin
    .from('profiles')
    .insert({ id: userAId, tenant_id: tenantAId, nombre: 'Orders Seam A', rol: 'admin' });
  if (pAErr) throw new Error(`profile A: ${pAErr.message}`);

  // Profile B
  const { error: pBErr } = await admin
    .from('profiles')
    .insert({ id: userBId, tenant_id: tenantBId, nombre: 'Orders Seam B', rol: 'admin' });
  if (pBErr) throw new Error(`profile B: ${pBErr.message}`);

  // Store A1 (primary store for tenant A)
  const { data: sA, error: sAErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantAId, nombre: `__seam_store_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (sAErr) throw new Error(`store A1: ${sAErr.message}`);
  storeAId = sA.id;

  // Store A2 (second store for tenant A — filter tests)
  const { data: sA2, error: sA2Err } = await admin
    .from('stores')
    .insert({ tenant_id: tenantAId, nombre: `__seam_store_a2_${UNIQUE}__` })
    .select('id')
    .single();
  if (sA2Err) throw new Error(`store A2: ${sA2Err.message}`);
  storeBId = sA2.id;

  // Product for tenant A
  const { data: pA, error: pAProductErr } = await admin
    .from('products')
    .insert({
      tenant_id: tenantAId,
      nombre: `__seam_product_${UNIQUE}__`,
      precio_unitario: 20.00,
      stock_actual: 100,
    })
    .select('id')
    .single();
  if (pAProductErr) throw new Error(`product A: ${pAProductErr.message}`);
  productAId = pA.id;

  // Authenticate both clients
  clientA = createBrowserStyleClient();
  const { error: signInAErr } = await clientA.auth.signInWithPassword({
    email: userAEmail,
    password: PASSWORD,
  });
  if (signInAErr) throw new Error(`sign-in A: ${signInAErr.message}`);

  clientB = createBrowserStyleClient();
  const { error: signInBErr } = await clientB.auth.signInWithPassword({
    email: userBEmail,
    password: PASSWORD,
  });
  if (signInBErr) throw new Error(`sign-in B: ${signInBErr.message}`);
}, 30_000);

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
afterAll(async () => {
  await clientA?.auth.signOut().catch(() => {});
  await clientB?.auth.signOut().catch(() => {});
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  // CASCADE deletes products, stores, orders, order_items
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// total NOT NULL after create_order
//
// RED until orchestrator applies 20260626120000_fix_create_order_total.sql.
// The old function leaves total = NULL. This test WILL FAIL until migration applied.
// ---------------------------------------------------------------------------
describe('create_order — total', () => {
  it('sets orders.total to sum of order_items.subtotal (RED until migration applied)', async () => {
    const { data: orderId, error } = await clientA.rpc('create_order', {
      p_store_id: storeAId,
      p_items: [{ product_id: productAId, cantidad: 2 }],
      p_notas: `total test ${UNIQUE}`,
    });

    expect(error).toBeNull();
    expect(orderId).not.toBeNull();

    const { data: order } = await admin
      .from('orders')
      .select('total')
      .eq('id', orderId)
      .single();

    // RED: old create_order does not set total → this assertion FAILS until migration applied
    expect(order?.total).not.toBeNull();
    expect(Number(order?.total)).toBeCloseTo(40.00, 2); // 2 units × $20.00
  });
});

// ---------------------------------------------------------------------------
// getOrder — nested joins
// ---------------------------------------------------------------------------
describe('getOrder', () => {
  it('returns store.nombre and items[].product.nombre via PostgREST nested select', async () => {
    // Insert order directly via admin (bypasses RPC, total irrelevant for join test)
    const { data: order, error: oErr } = await admin
      .from('orders')
      .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'pendiente', fecha: '2026-06-20' })
      .select('id')
      .single();
    if (oErr) throw new Error(`order insert: ${oErr.message}`);
    const orderId = order.id;

    // Insert order_item
    const { error: iErr } = await admin.from('order_items').insert({
      order_id: orderId,
      tenant_id: tenantAId,
      product_id: productAId,
      cantidad: 3,
      precio_unitario: 20.00,
    });
    if (iErr) throw new Error(`order_item insert: ${iErr.message}`);

    // Call seam function as authenticated user A
    const result = await getOrder(clientA, orderId);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(orderId);
    expect(result?.store).not.toBeNull();
    expect(result?.store?.nombre).toContain('__seam_store_a_');
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].product).not.toBeNull();
    expect(result?.items[0].product?.nombre).toContain('__seam_product_');
    expect(Number(result?.items[0].precio_unitario)).toBeCloseTo(20.00, 2);
  });

  it('returns null when accessed by tenant B (cross-tenant RLS isolation)', async () => {
    // Insert an order for tenant A
    const { data: order, error: oErr } = await admin
      .from('orders')
      .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'pendiente', fecha: '2026-06-20' })
      .select('id')
      .single();
    if (oErr) throw new Error(`order for cross-tenant test: ${oErr.message}`);

    // Tenant B should not see this order (RLS blocks it → single() returns error → null)
    const result = await getOrder(clientB, order.id);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getOrders — filters
// ---------------------------------------------------------------------------
describe('getOrders — filters', () => {
  let orderStoreA1: string;
  let orderStoreA2Early: string;
  let orderStoreA2Late: string;

  beforeAll(async () => {
    // Insert 3 orders for tenant A: two in storeA, one in storeBId (storeBId is store A2)
    const { data: o1, error: e1 } = await admin
      .from('orders')
      .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'pendiente', fecha: '2026-06-10' })
      .select('id')
      .single();
    if (e1) throw new Error(`order storeA early: ${e1.message}`);
    orderStoreA1 = o1.id;

    const { data: o2, error: e2 } = await admin
      .from('orders')
      .insert({ tenant_id: tenantAId, store_id: storeBId, estado: 'pendiente', fecha: '2026-06-15' })
      .select('id')
      .single();
    if (e2) throw new Error(`order storeA2 mid: ${e2.message}`);
    orderStoreA2Early = o2.id;

    const { data: o3, error: e3 } = await admin
      .from('orders')
      .insert({ tenant_id: tenantAId, store_id: storeBId, estado: 'pendiente', fecha: '2026-06-20' })
      .select('id')
      .single();
    if (e3) throw new Error(`order storeA2 late: ${e3.message}`);
    orderStoreA2Late = o3.id;
  });

  it('filters to only the correct store when storeId is provided', async () => {
    const orders = await getOrders(clientA, { storeId: storeBId });

    const returnedIds = orders.map((o) => o.id);
    expect(returnedIds).toContain(orderStoreA2Early);
    expect(returnedIds).toContain(orderStoreA2Late);
    expect(returnedIds).not.toContain(orderStoreA1);
  });

  it('filters by from date (gte) correctly', async () => {
    const orders = await getOrders(clientA, { from: '2026-06-14' });

    // Should include orders on/after Jun 14: orderStoreA2Early (Jun 15) + orderStoreA2Late (Jun 20)
    const returnedIds = orders.map((o) => o.id);
    expect(returnedIds).toContain(orderStoreA2Early);
    expect(returnedIds).toContain(orderStoreA2Late);
    expect(returnedIds).not.toContain(orderStoreA1);
  });

  it('filters by to date (lte) correctly', async () => {
    const orders = await getOrders(clientA, { to: '2026-06-12' });

    // Should include only orders on/before Jun 12: orderStoreA1 (Jun 10)
    const returnedIds = orders.map((o) => o.id);
    expect(returnedIds).toContain(orderStoreA1);
    expect(returnedIds).not.toContain(orderStoreA2Early);
    expect(returnedIds).not.toContain(orderStoreA2Late);
  });

  it('combines storeId and date filters', async () => {
    const orders = await getOrders(clientA, { storeId: storeBId, from: '2026-06-18' });

    // storeBId orders on/after Jun 18: only orderStoreA2Late (Jun 20)
    const returnedIds = orders.map((o) => o.id);
    expect(returnedIds).toContain(orderStoreA2Late);
    expect(returnedIds).not.toContain(orderStoreA2Early);
    expect(returnedIds).not.toContain(orderStoreA1);
  });
});

// ---------------------------------------------------------------------------
// markDelivered
// ---------------------------------------------------------------------------
describe('markDelivered', () => {
  it('flips estado to entregado for a pendiente order', async () => {
    // Insert a pendiente order
    const { data: order, error: oErr } = await admin
      .from('orders')
      .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'pendiente' })
      .select('id')
      .single();
    if (oErr) throw new Error(`order for markDelivered: ${oErr.message}`);
    const orderId = order.id;

    // Call markDelivered as authenticated user A
    await markDelivered(clientA, orderId);

    // Verify estado is now 'entregado'
    const { data: updated } = await admin
      .from('orders')
      .select('estado')
      .eq('id', orderId)
      .single();

    expect(updated?.estado).toBe('entregado');
  });

  it('throws OrderNotDeliverableError for an already-delivered order', async () => {
    // Insert an order and force it to 'entregado' via admin
    const { data: order, error: oErr } = await admin
      .from('orders')
      .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'pendiente' })
      .select('id')
      .single();
    if (oErr) throw new Error(`order for reject test: ${oErr.message}`);
    const orderId = order.id;

    await admin.from('orders').update({ estado: 'entregado' }).eq('id', orderId);

    // markDelivered on a non-pendiente order must throw
    await expect(markDelivered(clientA, orderId)).rejects.toThrow(OrderNotDeliverableError);

    // Estado must remain 'entregado' (unchanged)
    const { data: unchanged } = await admin
      .from('orders')
      .select('estado')
      .eq('id', orderId)
      .single();
    expect(unchanged?.estado).toBe('entregado');
  });

  it('throws OrderNotDeliverableError for a cancelado order', async () => {
    const { data: order, error: oErr } = await admin
      .from('orders')
      .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'pendiente' })
      .select('id')
      .single();
    if (oErr) throw new Error(`order for cancel reject: ${oErr.message}`);

    await admin.from('orders').update({ estado: 'cancelado' }).eq('id', order.id);

    await expect(markDelivered(clientA, order.id)).rejects.toThrow(OrderNotDeliverableError);
  });
});
