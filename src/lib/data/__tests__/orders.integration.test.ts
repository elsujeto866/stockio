// @vitest-environment node
/**
 * Integration tests: create_order FEFO (REQ-2) + cancel_order restore lot (REQ-3).
 *
 * Requires migrations applied to remote Supabase (in order):
 *   1. 20260627100000_expiry_lots_schema.sql
 *   2. 20260627100100_expiry_lots_backfill.sql
 *   3. 20260627100200_create_purchase_lots.sql
 *   4. 20260627100300_create_order_fefo.sql
 *
 * Scenarios:
 *   S2-1: single lot — partial consume, lot quantity updated
 *   S2-2: multi-lot FEFO span — earliest expiry exhausted, second partial
 *   S2-3: insufficient stock → full rollback, no lot mutation
 *   S2-4: NULL-expiry lot consumed last (NULLS LAST ordering)
 *   S3-1: cancel single-item order → restore lot created, stock restored
 *   S3-2: cancel multi-item order → one restore lot per item
 *
 * SUM invariant: SUM(lots.quantity) = stock_actual asserted after each mutation.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// WebSocket stub
// ---------------------------------------------------------------------------
class _NoopWS extends EventTarget {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = _NoopWS.CLOSED;
  constructor(_url: string, _p?: string | string[]) { super(); }
  send(_d: unknown) {} close(_c?: number, _r?: string) {}
}

const UNIQUE = Date.now().toString(36);

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: _NoopWS as any } });
}

function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing env vars');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: _NoopWS as any } });
}

const admin = createAdminClient();

let tenantId: string;
let userId: string;
let userEmail: string;
let storeId: string;
const PASSWORD = 'TestPass123!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getStockActual(productId: string): Promise<number> {
  const { data } = await admin.from('products').select('stock_actual').eq('id', productId).single();
  return (data as { stock_actual: number }).stock_actual;
}

async function getLotSum(productId: string): Promise<number> {
  const { data } = await admin.from('lots').select('quantity').eq('product_id', productId);
  return ((data ?? []) as Array<{ quantity: number }>).reduce((s, r) => s + r.quantity, 0);
}

async function assertInvariant(productId: string) {
  const stock = await getStockActual(productId);
  const lotSum = await getLotSum(productId);
  expect(lotSum).toBe(stock);
}

async function getLotQuantity(lotId: string): Promise<number> {
  const { data } = await admin.from('lots').select('quantity').eq('id', lotId).single();
  return (data as { quantity: number }).quantity;
}

/** Insert a lot directly via admin (bypasses RPC) for test setup. */
async function insertLot(productId: string, quantity: number, expiryDate: string | null, receivedDate: string): Promise<string> {
  const { data: p } = await admin.from('products').select('tenant_id').eq('id', productId).single();
  const { data } = await admin.from('lots').insert({
    tenant_id: (p as { tenant_id: string }).tenant_id,
    product_id: productId,
    lot_type: 'purchase',
    quantity,
    received_date: receivedDate,
    expiry_date: expiryDate,
  }).select('id').single();
  return (data as { id: string }).id;
}

/** Create a fresh product with a given stock_actual for tests that need a clean slate. */
async function createTestProduct(nombre: string, stockActual: number): Promise<string> {
  const { data, error } = await admin.from('products').insert({
    tenant_id: tenantId,
    nombre,
    precio_unitario: 5,
    stock_actual: stockActual,
  }).select('id').single();
  if (error) throw new Error(`createTestProduct: ${error.message}`);
  return (data as { id: string }).id;
}

async function signInClient(): Promise<SupabaseClient> {
  const client = createBrowserClient();
  const { error } = await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return client;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userEmail = `ord-fefo+${UNIQUE}@stockio.test`;

  const { data: t, error: tErr } = await admin.from('tenants').insert({ nombre: `__ord_fefo_${UNIQUE}__` }).select('id').single();
  if (tErr) throw new Error(`tenant: ${tErr.message}`);
  tenantId = t.id;

  const { data: u, error: uErr } = await admin.auth.admin.createUser({ email: userEmail, password: PASSWORD, email_confirm: true });
  if (uErr) throw new Error(`user: ${uErr.message}`);
  userId = u.user.id;

  await admin.from('profiles').insert({ id: userId, tenant_id: tenantId, nombre: 'Test', rol: 'admin' });

  const { data: st, error: stErr } = await admin.from('stores').insert({ tenant_id: tenantId, nombre: `Store ${UNIQUE}`, activo: true }).select('id').single();
  if (stErr) throw new Error(`store: ${stErr.message}`);
  storeId = st.id;
}, 30_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
});

// ---------------------------------------------------------------------------
// S2-1: single lot, partial consume
// ---------------------------------------------------------------------------
describe('create_order — FEFO consumption (REQ-2)', () => {
  it('S2-1: single lot partially consumed, lot quantity updated, invariant holds', async () => {
    const client = await signInClient();
    const productId = await createTestProduct(`S2-1 Product ${UNIQUE}`, 50);
    const lotId = await insertLot(productId, 50, '2026-06-01', '2026-01-01');

    const { error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad: 30, sale_unit: 'unit' }],
    });
    expect(error).toBeNull();

    const lotQty = await getLotQuantity(lotId);
    expect(lotQty).toBe(20); // 50 - 30

    await assertInvariant(productId);
  });

  it('S2-2: multi-lot FEFO — earliest expiry zeroed, second partially consumed', async () => {
    const client = await signInClient();
    const productId = await createTestProduct(`S2-2 Product ${UNIQUE}`, 50);
    const lotL1Id = await insertLot(productId, 20, '2026-06-01', '2026-01-01'); // consumed first
    const lotL2Id = await insertLot(productId, 30, '2026-08-01', '2026-02-01');

    const { error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad: 40, sale_unit: 'unit' }],
    });
    expect(error).toBeNull();

    const l1Qty = await getLotQuantity(lotL1Id);
    const l2Qty = await getLotQuantity(lotL2Id);
    expect(l1Qty).toBe(0);  // zeroed — NOT deleted (D4)
    expect(l2Qty).toBe(10); // 30 - 20 remaining after L1 exhausted

    await assertInvariant(productId);
  });

  it('S2-3: insufficient stock → full rollback, no lot mutation', async () => {
    const client = await signInClient();
    const productId = await createTestProduct(`S2-3 Product ${UNIQUE}`, 20);
    const lotId = await insertLot(productId, 20, '2026-06-01', '2026-01-01');

    const { error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad: 25, sale_unit: 'unit' }],
    });
    expect(error).not.toBeNull(); // should fail with insufficient stock

    // Lot quantity must be unchanged
    const lotQty = await getLotQuantity(lotId);
    expect(lotQty).toBe(20);

    // Stock unchanged
    const stock = await getStockActual(productId);
    expect(stock).toBe(20);

    await assertInvariant(productId);
  });

  it('S2-4: NULL-expiry lot consumed LAST (NULLS LAST)', async () => {
    const client = await signInClient();
    const productId = await createTestProduct(`S2-4 Product ${UNIQUE}`, 30);
    const lotL1Id = await insertLot(productId, 10, '2026-06-01', '2026-01-01'); // dated — consumed first
    const lotL2Id = await insertLot(productId, 20, null, '2026-01-02');          // null expiry — consumed last

    const { error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad: 15, sale_unit: 'unit' }],
    });
    expect(error).toBeNull();

    const l1Qty = await getLotQuantity(lotL1Id);
    const l2Qty = await getLotQuantity(lotL2Id);
    expect(l1Qty).toBe(0);   // fully consumed first
    expect(l2Qty).toBe(15);  // 20 - 5 (only 5 taken from L2)

    await assertInvariant(productId);
  });
});

// ---------------------------------------------------------------------------
// S3-1 and S3-2: cancel_order — A2 restore lot
// ---------------------------------------------------------------------------
describe('cancel_order — restore lot (REQ-3)', () => {
  it('S3-1: single-item cancel → restore lot created, stock_actual restored', async () => {
    const client = await signInClient();
    const productId = await createTestProduct(`S3-1 Product ${UNIQUE}`, 50);
    await insertLot(productId, 50, '2026-08-01', '2026-01-01');

    // Create an order
    const { data: orderId, error: orderErr } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad: 10, sale_unit: 'unit' }],
    });
    expect(orderErr).toBeNull();

    const stockAfterOrder = await getStockActual(productId);
    expect(stockAfterOrder).toBe(40);

    // Cancel the order
    const { error: cancelErr } = await client.rpc('cancel_order', { p_order_id: orderId });
    expect(cancelErr).toBeNull();

    // stock_actual should be restored
    const stockAfterCancel = await getStockActual(productId);
    expect(stockAfterCancel).toBe(50);

    // A restore lot should exist
    const { data: restoreLots } = await admin.from('lots').select('lot_type, quantity, expiry_date').eq('product_id', productId).eq('lot_type', 'restore');
    expect(restoreLots).toHaveLength(1);
    expect(restoreLots![0].quantity).toBe(10);
    expect(restoreLots![0].expiry_date).toBeNull(); // restore lots always have NULL expiry

    await assertInvariant(productId);
  });

  it('S3-2: multi-item cancel → one restore lot per item, all stocks restored', async () => {
    const client = await signInClient();
    const productId1 = await createTestProduct(`S3-2 P1 ${UNIQUE}`, 30);
    const productId2 = await createTestProduct(`S3-2 P2 ${UNIQUE}`, 40);
    await insertLot(productId1, 30, '2026-08-01', '2026-01-01');
    await insertLot(productId2, 40, '2026-09-01', '2026-01-01');

    const { data: orderId, error: orderErr } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [
        { product_id: productId1, cantidad: 5, sale_unit: 'unit' },
        { product_id: productId2, cantidad: 8, sale_unit: 'unit' },
      ],
    });
    expect(orderErr).toBeNull();

    const { error: cancelErr } = await client.rpc('cancel_order', { p_order_id: orderId });
    expect(cancelErr).toBeNull();

    // Both products should have restore lots
    const { data: rl1 } = await admin.from('lots').select('quantity').eq('product_id', productId1).eq('lot_type', 'restore');
    const { data: rl2 } = await admin.from('lots').select('quantity').eq('product_id', productId2).eq('lot_type', 'restore');

    expect(rl1).toHaveLength(1);
    expect(rl1![0].quantity).toBe(5);
    expect(rl2).toHaveLength(1);
    expect(rl2![0].quantity).toBe(8);

    await assertInvariant(productId1);
    await assertInvariant(productId2);
  });
});
