// @vitest-environment node
/**
 * WU4 Integration Tests — RPCs
 *
 * Verifies the three SECURITY DEFINER RPCs:
 *   - create_order(p_store_id, p_items, p_notas): atomic order + stock decrement + price freeze
 *   - cancel_order(p_order_id): stock restore + estado → 'cancelado'
 *   - next_invoice_number(p_tenant_id): gapless counter, independent across tenants
 *
 * STRICT TDD — RED PHASE:
 *   The RPC migration (WU4) has NOT been applied yet.
 *   All RPC calls return an error because the functions don't exist.
 *   Tests expecting success (error === null) will FAIL → correct RED state.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// WebSocket stub — same pattern as schema.test.ts
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
// Unique suffix per test run
// ---------------------------------------------------------------------------
const UNIQUE = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------
function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY'
    );
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

let tenantId: string;
let tenantBId: string;   // second tenant for counter independence test
let userId: string;
let userEmail: string;
const PASSWORD = 'TestPass123!';

let storeId: string;
let productId: string;
let initialStock: number;
const UNIT_PRICE = 15.5;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userEmail = `rpc+${UNIQUE}@stockio.test`;
  initialStock = 20;

  // Tenant A
  const { data: t, error: tErr } = await admin
    .from('tenants')
    .insert({ nombre: `__rpcs_tenant_${UNIQUE}__` })
    .select('id')
    .single();
  if (tErr) throw new Error(`tenant insert failed: ${tErr.message}`);
  tenantId = t.id;

  // Tenant B (for counter independence)
  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__rpcs_tenant_b_${UNIQUE}__` })
    .select('id')
    .single();
  if (tBErr) throw new Error(`tenant B insert failed: ${tBErr.message}`);
  tenantBId = tB.id;

  // Auth user
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: userEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uErr) throw new Error(`user create failed: ${uErr.message}`);
  userId = u.user.id;

  // Profile
  const { error: pErr } = await admin
    .from('profiles')
    .insert({ id: userId, tenant_id: tenantId, nombre: 'RPC Tester', rol: 'admin' });
  if (pErr) throw new Error(`profile insert failed: ${pErr.message}`);

  // Store
  const { data: s, error: sErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantId, nombre: `__rpcs_store_${UNIQUE}__` })
    .select('id')
    .single();
  if (sErr) throw new Error(`store insert failed: ${sErr.message}`);
  storeId = s.id;

  // Product
  const { data: p, error: pProdErr } = await admin
    .from('products')
    .insert({
      tenant_id: tenantId,
      nombre: `__rpcs_product_${UNIQUE}__`,
      precio_unitario: UNIT_PRICE,
      stock_actual: initialStock,
    })
    .select('id')
    .single();
  if (pProdErr) throw new Error(`product insert failed: ${pProdErr.message}`);
  productId = p.id;
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// create_order
// ---------------------------------------------------------------------------
describe('create_order RPC', () => {
  it('creates an order, decrements stock, and freezes precio_unitario', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    const cantidad = 3;
    const { data, error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad }],
      p_notas: `Test order ${UNIQUE}`,
    });

    // RED: error returned because function does not exist yet
    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const orderId: string = data;

    // Verify stock was decremented
    const { data: prod } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    expect(prod?.stock_actual).toBe(initialStock - cantidad);

    // Verify order exists in pending state
    const { data: order } = await admin
      .from('orders')
      .select('estado, tenant_id')
      .eq('id', orderId)
      .single();
    expect(order?.estado).toBe('pendiente');
    expect(order?.tenant_id).toBe(tenantId);

    // Verify line item with frozen price
    const { data: items } = await admin
      .from('order_items')
      .select('precio_unitario, cantidad, subtotal')
      .eq('order_id', orderId);
    expect(items).toHaveLength(1);
    expect(Number(items![0].precio_unitario)).toBeCloseTo(UNIT_PRICE, 2);
    expect(items![0].cantidad).toBe(cantidad);
    expect(Number(items![0].subtotal)).toBeCloseTo(UNIT_PRICE * cantidad, 2);

    // Verify price freeze: changing catalog price does NOT change the existing order_item
    const newPrice = 999.99;
    await admin
      .from('products')
      .update({ precio_unitario: newPrice })
      .eq('id', productId);

    const { data: itemsAfterPriceChange } = await admin
      .from('order_items')
      .select('precio_unitario')
      .eq('order_id', orderId);
    // Price must still be the original UNIT_PRICE (frozen snapshot)
    expect(Number(itemsAfterPriceChange![0].precio_unitario)).toBeCloseTo(UNIT_PRICE, 2);

    // Restore original price for subsequent tests
    await admin
      .from('products')
      .update({ precio_unitario: UNIT_PRICE })
      .eq('id', productId);

    await client.auth.signOut();
  });

  it('raises an exception and leaves stock unchanged when cantidad > stock', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    // Read current stock before oversell attempt
    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    const stockBefore = before!.stock_actual as number;

    const { error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad: stockBefore + 100 }], // definitely oversell
      p_notas: 'Oversell test',
    });

    // RED: error is null (fn doesn't exist → different error, or success → RED either way)
    expect(error).not.toBeNull(); // expects a DB-level exception

    // Stock must be unchanged (atomicity guarantee)
    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    expect(after?.stock_actual).toBe(stockBefore);

    await client.auth.signOut();
  });
});

// ---------------------------------------------------------------------------
// cancel_order
// ---------------------------------------------------------------------------
describe('cancel_order RPC', () => {
  it('restores stock and sets estado to cancelado', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    // Read stock before order creation
    const { data: prodBefore } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    const stockBefore = prodBefore!.stock_actual as number;

    const cantidad = 2;

    // Create order via RPC
    const { data: orderId, error: createErr } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad }],
      p_notas: 'To be cancelled',
    });
    // RED: create_order doesn't exist → error here; rest of test will fail
    expect(createErr).toBeNull();

    // Cancel via RPC
    const { error: cancelErr } = await client.rpc('cancel_order', {
      p_order_id: orderId,
    });
    // RED: cancel_order doesn't exist → error here
    expect(cancelErr).toBeNull();

    // Stock must be restored to pre-order level
    const { data: prodAfter } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    expect(prodAfter?.stock_actual).toBe(stockBefore);

    // Order estado must be 'cancelado'
    const { data: order } = await admin
      .from('orders')
      .select('estado')
      .eq('id', orderId)
      .single();
    expect(order?.estado).toBe('cancelado');

    await client.auth.signOut();
  });

  it('rejects cancellation of a non-pending order', async () => {
    // Use admin client to force-set an order to 'entregado', then try to cancel
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    // Create an order first
    const { data: orderId } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad: 1 }],
      p_notas: 'Force delivered',
    });

    if (orderId) {
      // Force state to 'entregado' via admin (bypasses RLS)
      await admin
        .from('orders')
        .update({ estado: 'entregado' })
        .eq('id', orderId);

      const { error } = await client.rpc('cancel_order', { p_order_id: orderId });
      // Must raise because order is not 'pendiente'
      expect(error).not.toBeNull();
    }

    await client.auth.signOut();
  });
});

// ---------------------------------------------------------------------------
// next_invoice_number
// ---------------------------------------------------------------------------
describe('next_invoice_number RPC', () => {
  it('returns sequential numbers starting from 1 for a new tenant', async () => {
    // Use admin client (SECURITY DEFINER fn can be called with any authenticated client)
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    const { data: n1, error: e1 } = await client.rpc('next_invoice_number', {
      p_tenant_id: tenantId,
    });
    // RED: function doesn't exist
    expect(e1).toBeNull();
    expect(n1).toBe(1);

    const { data: n2, error: e2 } = await client.rpc('next_invoice_number', {
      p_tenant_id: tenantId,
    });
    expect(e2).toBeNull();
    expect(n2).toBe(2);

    const { data: n3, error: e3 } = await client.rpc('next_invoice_number', {
      p_tenant_id: tenantId,
    });
    expect(e3).toBeNull();
    expect(n3).toBe(3);

    await client.auth.signOut();
  });

  it('counter is independent across tenants', async () => {
    // Tenant B starts its own counter from 1 regardless of tenant A's counter
    // Note: tenantBId fixture has no user, so call via admin client
    const { data: n1, error: e1 } = await admin.rpc('next_invoice_number', {
      p_tenant_id: tenantBId,
    });
    // RED: function doesn't exist
    expect(e1).toBeNull();
    expect(n1).toBe(1);

    // Tenant A counter must not be affected by tenant B's call
    const { data: counterA } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', tenantId)
      .single();
    // If tenant A's counter was used in the previous test, it must be at 3
    // Tenant B must be at 1, proving independence
    const { data: counterB } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', tenantBId)
      .single();
    expect(counterB?.last_number).toBe(1);
    // A's counter is unaffected
    expect(counterA?.last_number).toBeGreaterThanOrEqual(1);
  });
});
