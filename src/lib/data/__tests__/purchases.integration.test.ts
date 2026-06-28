// @vitest-environment node
/**
 * Integration tests: create_purchase (REQ-1) + cancel_purchase (REQ-4)
 *
 * Tests lot creation on purchase and lot integrity enforcement on cancel.
 *
 * Requires migrations applied to remote Supabase (in order):
 *   1. 20260627100000_expiry_lots_schema.sql
 *   2. 20260627100100_expiry_lots_backfill.sql
 *   3. 20260627100200_create_purchase_lots.sql
 *
 * Scenarios covered:
 *   S1-1: shelf_life_days set, no override → lot with computed expiry
 *   S1-2: operator override wins over shelf_life_days computation
 *   S1-3: shelf_life_days null, no override → NULL expiry, no error
 *   S4-1: cancel intact lots → lots zeroed, stock_actual = 0
 *   S4-2: cancel after partial consumption → raises error, state unchanged
 *
 * SUM invariant: SUM(lots.quantity) = stock_actual is asserted after each mutation.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPurchase, cancelPurchase } from '@/lib/data/purchases';

// ---------------------------------------------------------------------------
// WebSocket stub (prevents Node realtime socket noise)
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
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: _NoopWS as any } });
}

const admin = createAdminClient();

let tenantId: string;
let userId: string;
let userEmail: string;
let supplierId: string;

/** Product with shelf_life_days = 90. */
let productWithShelfLifeId: string;
/** Product with shelf_life_days = null. */
let productNoShelfLifeId: string;

const PASSWORD = 'TestPass123!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getStockActual(productId: string): Promise<number> {
  const { data } = await admin.from('products').select('stock_actual').eq('id', productId).single();
  return (data as { stock_actual: number }).stock_actual;
}

async function getLotSumForProduct(productId: string): Promise<number> {
  const { data } = await admin.from('lots').select('quantity').eq('product_id', productId);
  return ((data ?? []) as Array<{ quantity: number }>).reduce((s, r) => s + r.quantity, 0);
}

async function assertInvariant(productId: string) {
  const stock = await getStockActual(productId);
  const lotSum = await getLotSumForProduct(productId);
  expect(lotSum).toBe(stock);
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
  userEmail = `pur-lots+${UNIQUE}@stockio.test`;

  const { data: t, error: tErr } = await admin.from('tenants').insert({ nombre: `__pur_lots_${UNIQUE}__` }).select('id').single();
  if (tErr) throw new Error(`tenant: ${tErr.message}`);
  tenantId = t.id;

  const { data: u, error: uErr } = await admin.auth.admin.createUser({ email: userEmail, password: PASSWORD, email_confirm: true });
  if (uErr) throw new Error(`user: ${uErr.message}`);
  userId = u.user.id;

  await admin.from('profiles').insert({ id: userId, tenant_id: tenantId, nombre: 'Test', rol: 'admin' });

  const { data: s, error: sErr } = await admin.from('suppliers').insert({ tenant_id: tenantId, nombre: `Sup ${UNIQUE}`, activo: true }).select('id').single();
  if (sErr) throw new Error(`supplier: ${sErr.message}`);
  supplierId = s.id;

  const { data: pA, error: pAErr } = await admin.from('products').insert({ tenant_id: tenantId, nombre: `Prod ShelfLife ${UNIQUE}`, precio_unitario: 10, stock_actual: 0, shelf_life_days: 90 }).select('id').single();
  if (pAErr) throw new Error(`product A: ${pAErr.message}`);
  productWithShelfLifeId = pA.id;

  const { data: pB, error: pBErr } = await admin.from('products').insert({ tenant_id: tenantId, nombre: `Prod NoShelf ${UNIQUE}`, precio_unitario: 5, stock_actual: 0, shelf_life_days: null }).select('id').single();
  if (pBErr) throw new Error(`product B: ${pBErr.message}`);
  productNoShelfLifeId = pB.id;
}, 30_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
});

// ---------------------------------------------------------------------------
// S1-1: shelf_life_days set → lot with computed expiry
// ---------------------------------------------------------------------------
describe('create_purchase — lot creation (REQ-1)', () => {
  it('S1-1: shelf_life_days=90, received_date=2026-01-01 → lot expiry=2026-04-01', async () => {
    const client = await signInClient();

    await createPurchase(client, {
      supplierId,
      fecha: '2026-01-01',
      items: [{ productId: productWithShelfLifeId, cantidad: 100, costoUnitario: 1 }],
    });

    const { data: lots } = await admin
      .from('lots')
      .select('lot_type, quantity, expiry_date')
      .eq('product_id', productWithShelfLifeId)
      .eq('lot_type', 'purchase')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(lots).toHaveLength(1);
    expect(lots![0].expiry_date).toBe('2026-04-01');
    expect(lots![0].quantity).toBe(100);

    await assertInvariant(productWithShelfLifeId);
  });

  it('S1-2: operator override wins — expiry_date uses override, not computed', async () => {
    const client = await signInClient();

    await createPurchase(client, {
      supplierId,
      fecha: '2026-01-01',
      items: [{ productId: productWithShelfLifeId, cantidad: 50, costoUnitario: 1, expiryDate: '2026-03-15' }],
    });

    const { data: lots } = await admin
      .from('lots')
      .select('expiry_date, quantity')
      .eq('product_id', productWithShelfLifeId)
      .eq('expiry_date', '2026-03-15');

    expect(lots).toHaveLength(1);
    expect(lots![0].quantity).toBe(50);

    await assertInvariant(productWithShelfLifeId);
  });

  it('S1-3: shelf_life_days null, no override → NULL expiry lot created, no error', async () => {
    const client = await signInClient();

    await createPurchase(client, {
      supplierId,
      fecha: '2026-01-01',
      items: [{ productId: productNoShelfLifeId, cantidad: 20, costoUnitario: 1 }],
    });

    const { data: lots } = await admin
      .from('lots')
      .select('expiry_date, quantity')
      .eq('product_id', productNoShelfLifeId)
      .eq('lot_type', 'purchase');

    expect(lots!.some((l: { expiry_date: string | null }) => l.expiry_date === null)).toBe(true);

    const stock = await getStockActual(productNoShelfLifeId);
    expect(stock).toBeGreaterThan(0);

    await assertInvariant(productNoShelfLifeId);
  });
});

// ---------------------------------------------------------------------------
// S4-1: cancel intact lots → lots zeroed, stock_actual = 0
// S4-2: cancel after partial consumption → rejected
// ---------------------------------------------------------------------------
describe('cancel_purchase — lot guard (REQ-4)', () => {
  it('S4-1: cancel with intact lots → lots.quantity=0, stock_actual=0', async () => {
    const client = await signInClient();

    // Fresh product for this sub-test
    const { data: p, error: pErr } = await admin.from('products').insert({ tenant_id: tenantId, nombre: `Cancel Intact ${UNIQUE}`, precio_unitario: 5, stock_actual: 0, shelf_life_days: null }).select('id').single();
    if (pErr) throw new Error(`product: ${pErr.message}`);
    const productId = p.id;

    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [{ productId, cantidad: 30, costoUnitario: 1 }],
    });

    // Verify lot was created
    const { data: lotsBeforeCancel } = await admin.from('lots').select('quantity').eq('product_id', productId);
    const sumBefore = (lotsBeforeCancel ?? []).reduce((s: number, r: { quantity: number }) => s + r.quantity, 0);
    expect(sumBefore).toBe(30);

    await cancelPurchase(client, purchaseId);

    // After cancel: lots zeroed, stock = 0
    const { data: lotsAfter } = await admin.from('lots').select('quantity').eq('product_id', productId);
    const sumAfter = (lotsAfter ?? []).reduce((s: number, r: { quantity: number }) => s + r.quantity, 0);
    expect(sumAfter).toBe(0);

    const stock = await getStockActual(productId);
    expect(stock).toBe(0);

    await assertInvariant(productId);
  });

  it('S4-2: cancel after partial consumption → raises, state unchanged', async () => {
    const client = await signInClient();

    // Fresh product
    const { data: p, error: pErr } = await admin.from('products').insert({ tenant_id: tenantId, nombre: `Cancel Partial ${UNIQUE}`, precio_unitario: 5, stock_actual: 0, shelf_life_days: null }).select('id').single();
    if (pErr) throw new Error(`product: ${pErr.message}`);
    const productId = p.id;

    // Create a store for the order
    const { data: store, error: stErr } = await admin.from('stores').insert({ tenant_id: tenantId, nombre: `Store ${UNIQUE}`, activo: true }).select('id').single();
    if (stErr) throw new Error(`store: ${stErr.message}`);

    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [{ productId, cantidad: 20, costoUnitario: 1 }],
    });

    // Partially consume: create an order that takes some stock
    const { error: orderErr } = await client.rpc('create_order', {
      p_store_id: store.id,
      p_items: [{ product_id: productId, cantidad: 8, sale_unit: 'unit' }],
    });
    if (orderErr) throw new Error(`order: ${orderErr.message}`);

    // Now try to cancel the purchase — should be rejected
    await expect(cancelPurchase(client, purchaseId)).rejects.toThrow();

    // State should be unchanged: stock_actual still 12 (20 - 8)
    const stock = await getStockActual(productId);
    expect(stock).toBe(12);

    await assertInvariant(productId);
  });
});
