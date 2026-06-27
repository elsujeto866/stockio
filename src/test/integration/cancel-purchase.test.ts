// @vitest-environment node
/**
 * Integration Tests — cancel_purchase RPC
 *
 * Verifies that the cancel_purchase SECURITY DEFINER RPC:
 *   - Decrements stock_actual and sets estado='cancelado' on success (REQ-P2)
 *   - Raises a parseable domain error (not generic) when stock would go negative (REQ-P2)
 *   - Rejects double-cancel (estado already 'cancelado') with correct message (REQ-P2)
 *   - Blocks cross-tenant cancel with a not-found-in-tenant error (REQ-P2)
 *
 * Satisfies: REQ-P2 (all scenarios)
 *
 * Requires migration 20260626160000_suppliers_purchases.sql applied to the
 * remote DB (purchases + purchase_items + cancel_purchase RPC).
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPurchase, cancelPurchase } from '@/lib/data/purchases';

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
  if (!url || !secretKey) throw new Error('Missing env vars');
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });
}

function createBrowserStyleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error('Missing env vars');
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });
}

const admin = createAdminClient();

let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;
let userAEmail: string;
let userBEmail: string;
let supplierId: string;
let productId: string;
const PASSWORD = 'TestPass123!';

beforeAll(async () => {
  userAEmail = `cancel-purchase-a+${UNIQUE}@stockio.test`;
  userBEmail = `cancel-purchase-b+${UNIQUE}@stockio.test`;

  // Tenant A
  const { data: tA } = await admin
    .from('tenants').insert({ nombre: `__cancel_a_${UNIQUE}__` }).select('id').single();
  tenantAId = tA!.id;

  // Tenant B
  const { data: tB } = await admin
    .from('tenants').insert({ nombre: `__cancel_b_${UNIQUE}__` }).select('id').single();
  tenantBId = tB!.id;

  // Users
  const { data: uA } = await admin.auth.admin.createUser({ email: userAEmail, password: PASSWORD, email_confirm: true });
  userAId = uA!.user!.id;
  const { data: uB } = await admin.auth.admin.createUser({ email: userBEmail, password: PASSWORD, email_confirm: true });
  userBId = uB!.user!.id;

  // Profiles
  await admin.from('profiles').insert({ id: userAId, tenant_id: tenantAId, nombre: 'User A', rol: 'admin' });
  await admin.from('profiles').insert({ id: userBId, tenant_id: tenantBId, nombre: 'User B', rol: 'admin' });

  // Supplier for A
  const { data: s } = await admin
    .from('suppliers')
    .insert({ tenant_id: tenantAId, nombre: `Supplier ${UNIQUE}`, activo: true })
    .select('id').single();
  supplierId = s!.id;

  // Product for A (with enough stock for tests)
  const { data: p } = await admin
    .from('products')
    .insert({ tenant_id: tenantAId, nombre: `Product ${UNIQUE}`, precio_unitario: 10, stock_actual: 20 })
    .select('id').single();
  productId = p!.id;
}, 30_000);

afterAll(async () => {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

async function signInAs(email: string): Promise<SupabaseClient> {
  const client = createBrowserStyleClient();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return client;
}

describe('cancel_purchase RPC', () => {
  it('successful cancel: decrements stock, sets estado=cancelado (REQ-P2)', async () => {
    const client = await signInAs(userAEmail);

    // Ensure clean stock
    await admin.from('products').update({ stock_actual: 10 }).eq('id', productId);

    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [{ productId, cantidad: 3, costoUnitario: 5 }],
    });
    // stock is now 13

    await cancelPurchase(client, purchaseId);

    const { data: purchase } = await admin.from('purchases').select('estado').eq('id', purchaseId).single();
    expect(purchase!.estado).toBe('cancelado');

    const { data: product } = await admin.from('products').select('stock_actual').eq('id', productId).single();
    expect(Number(product!.stock_actual)).toBe(10); // back to original

    await client.auth.signOut();
  });

  it('negative-stock reject: raises domain error with product id, current, purchase (REQ-P2)', async () => {
    const client = await signInAs(userAEmail);

    // Set stock to 2
    await admin.from('products').update({ stock_actual: 2 }).eq('id', productId);

    // Create purchase for qty=5 (stock becomes 7 after create)
    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [{ productId, cantidad: 5, costoUnitario: 3 }],
    });
    // stock is now 7

    // Now manually reduce stock back to 1 (simulating sales)
    await admin.from('products').update({ stock_actual: 1 }).eq('id', productId);

    const err = await cancelPurchase(client, purchaseId).then(() => null).catch((e: unknown) => e);
    expect(err).toBeDefined();
    const msg = (err as { message?: string }).message ?? String(err);
    expect(msg).toMatch(/Cannot cancel purchase: product .+ stock would go negative \(current: 1, purchase: 5\)/i);

    // Verify no mutation occurred
    const { data: purchase } = await admin.from('purchases').select('estado').eq('id', purchaseId).single();
    expect(purchase!.estado).toBe('recibido');

    const { data: product } = await admin.from('products').select('stock_actual').eq('id', productId).single();
    expect(Number(product!.stock_actual)).toBe(1);

    await client.auth.signOut();
  });

  it('double-cancel: second call throws "Only received purchases" (REQ-P2)', async () => {
    const client = await signInAs(userAEmail);

    await admin.from('products').update({ stock_actual: 20 }).eq('id', productId);

    const purchaseId = await createPurchase(client, {
      supplierId,
      items: [{ productId, cantidad: 2, costoUnitario: 1 }],
    });

    await cancelPurchase(client, purchaseId); // first cancel OK

    const err = await cancelPurchase(client, purchaseId).then(() => null).catch((e: unknown) => e);
    expect(err).toBeDefined();
    const msg = (err as { message?: string }).message ?? String(err);
    expect(msg).toMatch(/Only received purchases/i);

    // stock NOT double-decremented
    const { data: product } = await admin.from('products').select('stock_actual').eq('id', productId).single();
    // After create (+2) then cancel (-2) back to original; second cancel should not subtract again
    expect(Number(product!.stock_actual)).toBe(20);

    await client.auth.signOut();
  });

  it('cross-tenant cancel: tenant B cannot cancel tenant A purchase (REQ-P2)', async () => {
    const clientA = await signInAs(userAEmail);

    await admin.from('products').update({ stock_actual: 10 }).eq('id', productId);

    const purchaseId = await createPurchase(clientA, {
      supplierId,
      items: [{ productId, cantidad: 1, costoUnitario: 1 }],
    });
    await clientA.auth.signOut();

    // Tenant B tries to cancel
    const clientB = await signInAs(userBEmail);
    const err = await cancelPurchase(clientB, purchaseId).then(() => null).catch((e: unknown) => e);
    expect(err).toBeDefined();
    const msg = (err as { message?: string }).message ?? String(err);
    expect(msg).toMatch(/not found in tenant/i);

    await clientB.auth.signOut();

    // Verify purchase still recibido
    const { data: purchase } = await admin.from('purchases').select('estado').eq('id', purchaseId).single();
    expect(purchase!.estado).toBe('recibido');
  });
});
