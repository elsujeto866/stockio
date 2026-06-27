// @vitest-environment node
/**
 * Integration Tests — Purchases + Purchase_Items RLS Isolation
 *
 * Verifies that Row Level Security policies enforce cross-tenant isolation:
 *   - Tenant B cannot SELECT tenant A's purchases
 *   - Tenant B cannot SELECT tenant A's purchase_items
 *   - Tenant B cannot INSERT a purchase with tenant A's tenant_id (WITH CHECK)
 *   - create_purchase with other-tenant supplier_id fails (server-side tenant derivation)
 *
 * Satisfies: REQ-T1 (purchases + purchase_items)
 *
 * Requires migration 20260626160000_suppliers_purchases.sql applied to the
 * remote DB (purchases + purchase_items + RLS policies + create_purchase RPC).
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPurchase } from '@/lib/data/purchases';

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
  if (!url || !secretKey) throw new Error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY');
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
let supplierAId: string;
let productAId: string;
let purchaseAId: string;
const PASSWORD = 'TestPass123!';

beforeAll(async () => {
  userAEmail = `purch-rls-a+${UNIQUE}@stockio.test`;
  userBEmail = `purch-rls-b+${UNIQUE}@stockio.test`;

  const { data: tA } = await admin.from('tenants').insert({ nombre: `__p_rls_a_${UNIQUE}__` }).select('id').single();
  tenantAId = tA!.id;

  const { data: tB } = await admin.from('tenants').insert({ nombre: `__p_rls_b_${UNIQUE}__` }).select('id').single();
  tenantBId = tB!.id;

  const { data: uA } = await admin.auth.admin.createUser({ email: userAEmail, password: PASSWORD, email_confirm: true });
  userAId = uA!.user!.id;
  const { data: uB } = await admin.auth.admin.createUser({ email: userBEmail, password: PASSWORD, email_confirm: true });
  userBId = uB!.user!.id;

  await admin.from('profiles').insert({ id: userAId, tenant_id: tenantAId, nombre: 'User A', rol: 'admin' });
  await admin.from('profiles').insert({ id: userBId, tenant_id: tenantBId, nombre: 'User B', rol: 'admin' });

  // Supplier and product for tenant A
  const { data: s } = await admin.from('suppliers').insert({ tenant_id: tenantAId, nombre: `Supplier A ${UNIQUE}`, activo: true }).select('id').single();
  supplierAId = s!.id;

  const { data: p } = await admin.from('products').insert({ tenant_id: tenantAId, nombre: `Prod A ${UNIQUE}`, precio_unitario: 5, stock_actual: 50 }).select('id').single();
  productAId = p!.id;

  // Create a purchase for tenant A (via the actual RPC with user A signed in)
  const clientA = createBrowserStyleClient();
  await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });
  purchaseAId = await createPurchase(clientA, {
    supplierId: supplierAId,
    items: [{ productId: productAId, cantidad: 2, costoUnitario: 5 }],
  });
  await clientA.auth.signOut();
}, 60_000);

afterAll(async () => {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

describe('RLS: Tenant A can read its own purchases', () => {
  it('user A sees tenant A purchases', async () => {
    const clientA = createBrowserStyleClient();
    await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });

    const { data, error } = await clientA.from('purchases').select('id').eq('id', purchaseAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    await clientA.auth.signOut();
  });
});

describe('RLS: Tenant B CANNOT read Tenant A purchases', () => {
  it('user B gets zero rows when querying tenant A purchase (REQ-T1)', async () => {
    const clientB = createBrowserStyleClient();
    await clientB.auth.signInWithPassword({ email: userBEmail, password: PASSWORD });

    const { data, error } = await clientB.from('purchases').select('id').eq('id', purchaseAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    await clientB.auth.signOut();
  });

  it('user B gets zero rows on purchase_items for tenant A purchase (REQ-T1)', async () => {
    const clientB = createBrowserStyleClient();
    await clientB.auth.signInWithPassword({ email: userBEmail, password: PASSWORD });

    const { data, error } = await clientB
      .from('purchase_items')
      .select('id')
      .eq('purchase_id', purchaseAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    await clientB.auth.signOut();
  });

  it('user B cannot INSERT a purchase with tenant A tenant_id (WITH CHECK) (REQ-T1)', async () => {
    const clientB = createBrowserStyleClient();
    await clientB.auth.signInWithPassword({ email: userBEmail, password: PASSWORD });

    const { error } = await clientB.from('purchases').insert({
      tenant_id: tenantAId,
      supplier_id: supplierAId,
      fecha: '2026-01-01',
      estado: 'recibido',
    });

    expect(error).not.toBeNull();

    await clientB.auth.signOut();
  });

  it('create_purchase with tenant A supplier_id as tenant B → supplier validation fails (REQ-T1)', async () => {
    const clientB = createBrowserStyleClient();
    await clientB.auth.signInWithPassword({ email: userBEmail, password: PASSWORD });

    // Tenant B has no products/suppliers, but we need a product for the RPC call
    // The RPC derives tenant_id from get_tenant_id() → tenantBId
    // Supplier is tenant A's → not found in tenant B
    await expect(
      createPurchase(clientB, {
        supplierId: supplierAId, // tenant A's supplier
        items: [{ productId: productAId, cantidad: 1, costoUnitario: 5 }],
      })
    ).rejects.toSatisfy((err: unknown) => {
      const msg = (err as { message?: string }).message ?? String(err);
      return msg.toLowerCase().includes('not found in tenant');
    });

    await clientB.auth.signOut();
  });
});
