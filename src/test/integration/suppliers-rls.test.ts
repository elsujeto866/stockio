// @vitest-environment node
/**
 * Integration Tests — Suppliers RLS Isolation
 *
 * Verifies that Row Level Security policies on public.suppliers enforce
 * cross-tenant isolation:
 *   - Tenant B cannot SELECT tenant A's suppliers
 *   - Tenant B cannot INSERT a supplier with tenant A's tenant_id (WITH CHECK)
 *   - Tenant A can SELECT its own suppliers
 *
 * Satisfies: REQ-T1 (suppliers RLS)
 *
 * Requires migration 20260626160000_suppliers_purchases.sql applied to the
 * remote DB (suppliers table + RLS policies + GRANT).
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// WebSocket stub — prevents Node from complaining about the realtime socket
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
// Unique suffix per test run (avoids email collision across runs)
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

let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;
let userAEmail: string;
let userBEmail: string;
const PASSWORD = 'TestPass123!';

let supplierAId: string;

// ---------------------------------------------------------------------------
// Setup — provision two isolated tenants via admin client
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userAEmail = `sup-rls-a+${UNIQUE}@stockio.test`;
  userBEmail = `sup-rls-b+${UNIQUE}@stockio.test`;

  // 1. Create tenants
  const { data: tA, error: tAErr } = await admin
    .from('tenants')
    .insert({ nombre: `__sup_rls_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (tAErr) throw new Error(`tenant A insert failed: ${tAErr.message}`);
  tenantAId = tA.id;

  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__sup_rls_b_${UNIQUE}__` })
    .select('id')
    .single();
  if (tBErr) throw new Error(`tenant B insert failed: ${tBErr.message}`);
  tenantBId = tB.id;

  // 2. Create auth users
  const { data: uA, error: uAErr } = await admin.auth.admin.createUser({
    email: userAEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uAErr) throw new Error(`user A create failed: ${uAErr.message}`);
  userAId = uA.user.id;

  const { data: uB, error: uBErr } = await admin.auth.admin.createUser({
    email: userBEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uBErr) throw new Error(`user B create failed: ${uBErr.message}`);
  userBId = uB.user.id;

  // 3. Create profiles linking users to their tenants
  const { error: pAErr } = await admin
    .from('profiles')
    .insert({ id: userAId, tenant_id: tenantAId, nombre: 'Sup User A', rol: 'admin' });
  if (pAErr) throw new Error(`profile A insert failed: ${pAErr.message}`);

  const { error: pBErr } = await admin
    .from('profiles')
    .insert({ id: userBId, tenant_id: tenantBId, nombre: 'Sup User B', rol: 'admin' });
  if (pBErr) throw new Error(`profile B insert failed: ${pBErr.message}`);

  // 4. Seed a supplier for tenant A (via admin, bypasses RLS)
  const { data: supA, error: supAErr } = await admin
    .from('suppliers')
    .insert({
      tenant_id: tenantAId,
      nombre: `Supplier A ${UNIQUE}`,
      activo: true,
    })
    .select('id')
    .single();
  if (supAErr) throw new Error(`supplier A insert failed: ${supAErr.message}`);
  supplierAId = supA.id;
}, 30_000);

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
afterAll(async () => {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// Tests: own-tenant access
// ---------------------------------------------------------------------------
describe('RLS: Tenant A can read its own suppliers', () => {
  it('user A sees tenant A suppliers', async () => {
    const clientA = createBrowserStyleClient();
    const { error: signInErr } = await clientA.auth.signInWithPassword({
      email: userAEmail,
      password: PASSWORD,
    });
    if (signInErr) throw new Error(`sign-in A failed: ${signInErr.message}`);

    const { data, error } = await clientA
      .from('suppliers')
      .select('id')
      .eq('id', supplierAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(supplierAId);

    await clientA.auth.signOut();
  });
});

// ---------------------------------------------------------------------------
// Tests: cross-tenant isolation
// ---------------------------------------------------------------------------
describe('RLS: Tenant B CANNOT read Tenant A suppliers', () => {
  it('user B gets zero rows when querying tenant A supplier', async () => {
    const clientB = createBrowserStyleClient();
    await clientB.auth.signInWithPassword({ email: userBEmail, password: PASSWORD });

    const { data, error } = await clientB
      .from('suppliers')
      .select('id')
      .eq('id', supplierAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    await clientB.auth.signOut();
  });

  it('user B cannot INSERT a supplier with tenant A tenant_id (WITH CHECK blocks)', async () => {
    const clientB = createBrowserStyleClient();
    await clientB.auth.signInWithPassword({ email: userBEmail, password: PASSWORD });

    const { error } = await clientB.from('suppliers').insert({
      tenant_id: tenantAId,
      nombre: `Cross-tenant injection ${UNIQUE}`,
      activo: true,
    });

    expect(error).not.toBeNull();

    await clientB.auth.signOut();
  });
});
