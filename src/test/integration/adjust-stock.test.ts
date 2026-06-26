// @vitest-environment node
/**
 * Integration Tests — adjustStock via real Supabase DB
 *
 * Verifies R5:
 *   - Positive delta increases stock_actual
 *   - Negative delta within floor decreases stock_actual
 *   - Delta that would push stock below 0 is rejected by the DB CHECK
 *     constraint (code 23514) and stock_actual remains unchanged
 *
 * Tests are sequential and depend on each other's state — currentStock
 * tracks the running value.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adjustStock, StockUnderflowError, getProduct } from '@/lib/data/products';
import { createProduct } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// WebSocket stub
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
// Unique suffix
// ---------------------------------------------------------------------------
const UNIQUE = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------
function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey)
    throw new Error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY');
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });
}

function createBrowserStyleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  return createClient(url, key, {
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
const INITIAL_STOCK = 20;

let tenantId: string;
let userId: string;
let userEmail: string;
let client: SupabaseClient;
let productId: string;
let currentStock = INITIAL_STOCK;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userEmail = `adj+${UNIQUE}@stockio.test`;

  // Tenant
  const { data: t, error: tErr } = await admin
    .from('tenants')
    .insert({ nombre: `__adj_tenant_${UNIQUE}__` })
    .select('id')
    .single();
  if (tErr) throw new Error(`tenant: ${tErr.message}`);
  tenantId = t.id;

  // Auth user
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: userEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uErr) throw new Error(`user: ${uErr.message}`);
  userId = u.user.id;

  // Profile
  const { error: pErr } = await admin
    .from('profiles')
    .insert({ id: userId, tenant_id: tenantId, nombre: 'Adj Tester', rol: 'admin' });
  if (pErr) throw new Error(`profile: ${pErr.message}`);

  // Authenticate browser client
  client = createBrowserStyleClient();
  const { error: signInErr } = await client.auth.signInWithPassword({
    email: userEmail,
    password: PASSWORD,
  });
  if (signInErr) throw new Error(`sign-in: ${signInErr.message}`);

  // Create product via seam (tests RLS fills tenant_id)
  const product = await createProduct(client, {
    nombre: `__adj_product_${UNIQUE}__`,
    precio_unitario: 5.0,
    stock_actual: INITIAL_STOCK,
    stock_minimo: 2,
  });
  productId = product.id;
  currentStock = product.stock_actual;
}, 30_000);

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
afterAll(async () => {
  await client.auth.signOut().catch(() => {});
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
});

// ---------------------------------------------------------------------------
// R5 — Stock adjustment tests (sequential — each builds on previous state)
// ---------------------------------------------------------------------------
describe('adjustStock integration', () => {
  it('positive delta increases stock_actual', async () => {
    const delta = 5;
    const product = await adjustStock(client, productId, delta);

    expect(product.stock_actual).toBe(currentStock + delta);
    currentStock = product.stock_actual;
  });

  it('negative delta within floor decreases stock_actual', async () => {
    const delta = -3;
    const product = await adjustStock(client, productId, delta);

    expect(product.stock_actual).toBe(currentStock + delta);
    currentStock = product.stock_actual;
  });

  it('delta that would push stock below 0 throws StockUnderflowError', async () => {
    const underflowDelta = -(currentStock + 100); // guaranteed underflow

    await expect(adjustStock(client, productId, underflowDelta)).rejects.toBeInstanceOf(
      StockUnderflowError
    );
  });

  it('stock_actual is unchanged after a rejected underflow attempt', async () => {
    // Re-read from DB to confirm the row was not mutated by the failed update
    const product = await getProduct(client, productId);
    expect(product?.stock_actual).toBe(currentStock);
  });
});
