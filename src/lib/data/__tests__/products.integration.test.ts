// @vitest-environment node
/**
 * Integration tests: adjust_stock RPC (REQ-5).
 *
 * Requires migrations applied to remote Supabase (in order):
 *   1. 20260627100000_expiry_lots_schema.sql
 *   2. 20260627100100_expiry_lots_backfill.sql
 *   3. 20260627100200_create_purchase_lots.sql
 *   4. 20260627100300_create_order_fefo.sql
 *   5. 20260627100400_adjust_stock_rpc.sql
 *
 * Scenarios:
 *   S5-1: positive delta → 'adjustment' lot created, stock_actual increments
 *   S5-2: negative delta → FEFO consumption (L1 zeroed, L2 partially consumed)
 *   underflow: delta > stock_actual → raises 23514 errcode, no lot mutation
 *   p_delta=0: no-op (no lot created, stock unchanged)
 *
 * SUM invariant: SUM(lots.quantity) = stock_actual asserted after each mutation.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adjustStock, StockUnderflowError } from '@/lib/data/products';

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
  if (!url || !key) throw new Error('Missing env vars');
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

async function getLotQuantity(lotId: string): Promise<number> {
  const { data } = await admin.from('lots').select('quantity').eq('id', lotId).single();
  return (data as { quantity: number }).quantity;
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
  userEmail = `adj-stock+${UNIQUE}@stockio.test`;

  const { data: t, error: tErr } = await admin.from('tenants').insert({ nombre: `__adj_stock_${UNIQUE}__` }).select('id').single();
  if (tErr) throw new Error(`tenant: ${tErr.message}`);
  tenantId = t.id;

  const { data: u, error: uErr } = await admin.auth.admin.createUser({ email: userEmail, password: PASSWORD, email_confirm: true });
  if (uErr) throw new Error(`user: ${uErr.message}`);
  userId = u.user.id;

  await admin.from('profiles').insert({ id: userId, tenant_id: tenantId, nombre: 'Test', rol: 'admin' });
}, 30_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('adjust_stock RPC (REQ-5)', () => {
  it('S5-1: positive delta creates adjustment lot and increments stock_actual', async () => {
    const client = await signInClient();

    const { data: p, error: pErr } = await admin.from('products').insert({ tenant_id: tenantId, nombre: `Adj+ ${UNIQUE}`, precio_unitario: 5, stock_actual: 10 }).select('id').single();
    if (pErr) throw new Error(`product: ${pErr.message}`);
    const productId = (p as { id: string }).id;

    // Seed an existing lot so invariant holds before the RPC call
    await insertLot(productId, 10, null, '2026-01-01');

    const result = await adjustStock(client, productId, 5);

    expect(result.stock_actual).toBe(15);

    // An adjustment lot should have been created
    const { data: adjLots } = await admin.from('lots').select('lot_type, quantity').eq('product_id', productId).eq('lot_type', 'adjustment');
    expect(adjLots).toHaveLength(1);
    expect(adjLots![0].quantity).toBe(5);

    await assertInvariant(productId);
  });

  it('S5-2: negative delta consumes FEFO — L1 zeroed, L2 partial', async () => {
    const client = await signInClient();

    const { data: p, error: pErr } = await admin.from('products').insert({ tenant_id: tenantId, nombre: `Adj- ${UNIQUE}`, precio_unitario: 5, stock_actual: 30 }).select('id').single();
    if (pErr) throw new Error(`product: ${pErr.message}`);
    const productId = (p as { id: string }).id;

    const lotL1Id = await insertLot(productId, 10, '2026-06-01', '2026-01-01'); // consumed first
    const lotL2Id = await insertLot(productId, 20, '2026-08-01', '2026-02-01');

    const result = await adjustStock(client, productId, -12);

    expect(result.stock_actual).toBe(18); // 30 - 12

    const l1Qty = await getLotQuantity(lotL1Id);
    const l2Qty = await getLotQuantity(lotL2Id);
    expect(l1Qty).toBe(0);  // zeroed (FEFO — earliest expiry)
    expect(l2Qty).toBe(18); // 20 - 2 remaining

    await assertInvariant(productId);
  });

  it('underflow: delta exceeds stock_actual → raises 23514 (StockUnderflowError), no mutation', async () => {
    const client = await signInClient();

    const { data: p, error: pErr } = await admin.from('products').insert({ tenant_id: tenantId, nombre: `UnderflowTest ${UNIQUE}`, precio_unitario: 5, stock_actual: 5 }).select('id').single();
    if (pErr) throw new Error(`product: ${pErr.message}`);
    const productId = (p as { id: string }).id;

    await insertLot(productId, 5, null, '2026-01-01');

    await expect(adjustStock(client, productId, -10)).rejects.toThrow(StockUnderflowError);

    // Stock and lots must be unchanged
    const stock = await getStockActual(productId);
    expect(stock).toBe(5);
    await assertInvariant(productId);
  });

  it('p_delta=0: no-op — no lot created, stock unchanged', async () => {
    const client = await signInClient();

    const { data: p, error: pErr } = await admin.from('products').insert({ tenant_id: tenantId, nombre: `NoOp ${UNIQUE}`, precio_unitario: 5, stock_actual: 10 }).select('id').single();
    if (pErr) throw new Error(`product: ${pErr.message}`);
    const productId = (p as { id: string }).id;

    await insertLot(productId, 10, null, '2026-01-01');

    const result = await adjustStock(client, productId, 0);

    expect(result.stock_actual).toBe(10);

    const lotCount = await getLotSum(productId);
    expect(lotCount).toBe(10); // unchanged

    await assertInvariant(productId);
  });
});
