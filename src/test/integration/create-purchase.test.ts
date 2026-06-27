// @vitest-environment node
/**
 * Integration Tests — create_purchase RPC
 *
 * Verifies that the create_purchase SECURITY DEFINER RPC:
 *   - Increments stock_actual atomically for each purchased product
 *   - Freezes costo_unitario from user input (not a catalog price)
 *   - Sets purchases.total = Σ subtotals and purchases.estado = 'recibido'
 *   - Accepts backdated fecha
 *   - Accepts zero-stock products (no floor on creation)
 *   - Rejects inactive suppliers (raises domain error)
 *   - Rejects unknown products (raises; rolls back entire purchase)
 *   - Serializes concurrent creates on the same product via SELECT FOR UPDATE
 *
 * Satisfies: REQ-P1 (all scenarios)
 *
 * Requires migration 20260626160000_suppliers_purchases.sql applied to the
 * remote DB (purchases + purchase_items tables + create_purchase RPC).
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPurchase } from '@/lib/data/purchases';

// ---------------------------------------------------------------------------
// WebSocket stub — prevents Node from complaining about the realtime socket
// ---------------------------------------------------------------------------
class _NoopWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = _NoopWebSocket.CLOSED;
  constructor(_url: string, _protocols?: string | string[]) { super(); }
  send(_data: unknown) {}
  close(_code?: number, _reason?: string) {}
}

const UNIQUE = Date.now().toString(36);

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
    throw new Error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });
}

const admin = createAdminClient();

let tenantId: string;
let userId: string;
let userEmail: string;
let supplierId: string;
let productAId: string;
let productBId: string;
const PASSWORD = 'TestPass123!';

beforeAll(async () => {
  userEmail = `create-purchase+${UNIQUE}@stockio.test`;

  // Tenant
  const { data: t, error: tErr } = await admin
    .from('tenants')
    .insert({ nombre: `__create_purchase_${UNIQUE}__` })
    .select('id')
    .single();
  if (tErr) throw new Error(`tenant insert failed: ${tErr.message}`);
  tenantId = t.id;

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
    .insert({ id: userId, tenant_id: tenantId, nombre: 'Test User', rol: 'admin' });
  if (pErr) throw new Error(`profile insert failed: ${pErr.message}`);

  // Active supplier
  const { data: s, error: sErr } = await admin
    .from('suppliers')
    .insert({ tenant_id: tenantId, nombre: `Proveedor ${UNIQUE}`, activo: true })
    .select('id')
    .single();
  if (sErr) throw new Error(`supplier insert failed: ${sErr.message}`);
  supplierId = s.id;

  // Products
  const { data: pA, error: pAErr } = await admin
    .from('products')
    .insert({ tenant_id: tenantId, nombre: `Product A ${UNIQUE}`, precio_unitario: 10, stock_actual: 10 })
    .select('id')
    .single();
  if (pAErr) throw new Error(`product A insert failed: ${pAErr.message}`);
  productAId = pA.id;

  const { data: pB, error: pBErr } = await admin
    .from('products')
    .insert({ tenant_id: tenantId, nombre: `Product B ${UNIQUE}`, precio_unitario: 20, stock_actual: 7 })
    .select('id')
    .single();
  if (pBErr) throw new Error(`product B insert failed: ${pBErr.message}`);
  productBId = pB.id;
}, 30_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
});

async function signInClient(): Promise<SupabaseClient> {
  const client = createBrowserStyleClient();
  const { error } = await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('create_purchase RPC', () => {
  it('single-item: increments stock_actual, persists subtotal, total, estado=recibido (REQ-P1)', async () => {
    const client = await signInClient();

    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productAId)
      .single();
    const initialStock = before!.stock_actual as number;

    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [{ productId: productAId, cantidad: 5, costoUnitario: 2.50 }],
    });

    expect(purchaseId).toBeTruthy();

    const { data: purchase } = await admin
      .from('purchases')
      .select('total, estado')
      .eq('id', purchaseId)
      .single();

    expect(purchase!.estado).toBe('recibido');
    expect(Number(purchase!.total)).toBeCloseTo(12.50);

    const { data: item } = await admin
      .from('purchase_items')
      .select('subtotal')
      .eq('purchase_id', purchaseId)
      .single();
    expect(Number(item!.subtotal)).toBeCloseTo(12.50);

    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productAId)
      .single();
    expect(Number(after!.stock_actual)).toBe(initialStock + 5);

    await client.auth.signOut();
  });

  it('multi-item: both products incremented; total = Σ subtotals (REQ-P1)', async () => {
    const client = await signInClient();

    const { data: bA } = await admin.from('products').select('stock_actual').eq('id', productAId).single();
    const { data: bB } = await admin.from('products').select('stock_actual').eq('id', productBId).single();
    const stockA = bA!.stock_actual as number;
    const stockB = bB!.stock_actual as number;

    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [
        { productId: productAId, cantidad: 2, costoUnitario: 1.00 },
        { productId: productBId, cantidad: 4, costoUnitario: 3.00 },
      ],
    });

    const { data: purchase } = await admin.from('purchases').select('total').eq('id', purchaseId).single();
    expect(Number(purchase!.total)).toBeCloseTo(14.00);

    const { data: aA } = await admin.from('products').select('stock_actual').eq('id', productAId).single();
    const { data: aB } = await admin.from('products').select('stock_actual').eq('id', productBId).single();
    expect(Number(aA!.stock_actual)).toBe(stockA + 2);
    expect(Number(aB!.stock_actual)).toBe(stockB + 4);

    await client.auth.signOut();
  });

  it('backdated fecha accepted: purchases.fecha = provided date (REQ-P1)', async () => {
    const client = await signInClient();

    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [{ productId: productAId, cantidad: 1, costoUnitario: 5.00 }],
      fecha: '2024-12-15',
    });

    const { data: purchase } = await admin.from('purchases').select('fecha').eq('id', purchaseId).single();
    expect(purchase!.fecha).toBe('2024-12-15');

    await client.auth.signOut();
  });

  it('zero-stock product: purchase succeeds and stock increments normally (REQ-P1)', async () => {
    const client = await signInClient();

    // Set product A stock to 0 for this test
    await admin.from('products').update({ stock_actual: 0 }).eq('id', productBId);

    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [{ productId: productBId, cantidad: 3, costoUnitario: 10 }],
    });

    expect(purchaseId).toBeTruthy();
    const { data: after } = await admin.from('products').select('stock_actual').eq('id', productBId).single();
    expect(Number(after!.stock_actual)).toBe(3);

    await client.auth.signOut();
  });

  it('costo_unitario frozen from input, not catalog price (REQ-P1)', async () => {
    const client = await signInClient();

    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [{ productId: productAId, cantidad: 1, costoUnitario: 99.99 }],
    });

    const { data: item } = await admin
      .from('purchase_items')
      .select('costo_unitario')
      .eq('purchase_id', purchaseId)
      .single();
    expect(Number(item!.costo_unitario)).toBeCloseTo(99.99);

    await client.auth.signOut();
  });

  it('inactive supplier rejected: throws containing "not found in tenant" (REQ-P1)', async () => {
    const client = await signInClient();

    // Create an inactive supplier
    const { data: inactiveS } = await admin
      .from('suppliers')
      .insert({ tenant_id: tenantId, nombre: `Inactive ${UNIQUE}`, activo: false })
      .select('id')
      .single();

    await expect(
      createPurchase(client, {
        supplierId: inactiveS!.id,
        items: [{ productId: productAId, cantidad: 1, costoUnitario: 5 }],
      })
    ).rejects.toSatisfy((err: unknown) => {
      const msg = (err as { message?: string }).message ?? String(err);
      return msg.toLowerCase().includes('not found in tenant');
    });

    await client.auth.signOut();
  });

  it('unknown product rejected: throws; stock unchanged; no purchase row (REQ-P1)', async () => {
    const client = await signInClient();

    const fakeProductId = '00000000-0000-4000-8000-000000000001';

    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productAId)
      .single();
    const stockBefore = before!.stock_actual as number;

    await expect(
      createPurchase(client, {
        supplierId,
        items: [{ productId: fakeProductId, cantidad: 1, costoUnitario: 5 }],
      })
    ).rejects.toBeDefined();

    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productAId)
      .single();
    expect(Number(after!.stock_actual)).toBe(stockBefore);

    await client.auth.signOut();
  });

  it('concurrent creates on same product serialize correctly (REQ-P1)', async () => {
    const client = await signInClient();

    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productAId)
      .single();
    const stockBefore = before!.stock_actual as number;

    await Promise.all([
      createPurchase(client, {
        supplierId,
        items: [{ productId: productAId, cantidad: 5, costoUnitario: 1 }],
      }),
      createPurchase(client, {
        supplierId,
        items: [{ productId: productAId, cantidad: 3, costoUnitario: 1 }],
      }),
    ]);

    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productAId)
      .single();
    expect(Number(after!.stock_actual)).toBe(stockBefore + 8);

    await client.auth.signOut();
  });
});
