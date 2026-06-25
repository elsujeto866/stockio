// @vitest-environment node
/**
 * WU4 Integration Tests — RLS Isolation
 *
 * Verifies that Row Level Security policies enforce cross-tenant isolation:
 *   - Tenant A session can read its own data
 *   - Tenant A session returns ZERO rows when querying Tenant B tables
 *   - Tenant A cannot INSERT/UPDATE/DELETE Tenant B rows
 *
 * STRICT TDD — RED PHASE:
 *   The RLS migration (WU4) has NOT been applied yet.
 *   Without policies, user A can read tenant B rows → isolation assertions FAIL.
 *   That is the correct RED state.
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

/**
 * Browser-style client with publishable key.
 * signInWithPassword() will stamp the returned client with the user's JWT,
 * making every subsequent query RLS-scoped to that user.
 */
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
// Fixture state (created once, shared across all tests in this file)
// ---------------------------------------------------------------------------
const admin = createAdminClient();

let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;
let userAEmail: string;
let userBEmail: string;
const PASSWORD = 'TestPass123!';

// Seeded resource IDs for assertions
let productAId: string;
let productBId: string;
let storeAId: string;
let storeBId: string;

// ---------------------------------------------------------------------------
// Setup — provision two isolated tenants via admin client
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userAEmail = `a+${UNIQUE}@stockio.test`;
  userBEmail = `b+${UNIQUE}@stockio.test`;

  // 1. Create tenants
  const { data: tA, error: tAErr } = await admin
    .from('tenants')
    .insert({ nombre: `__rls_tenant_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (tAErr) throw new Error(`tenant A insert failed: ${tAErr.message}`);
  tenantAId = tA.id;

  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__rls_tenant_b_${UNIQUE}__` })
    .select('id')
    .single();
  if (tBErr) throw new Error(`tenant B insert failed: ${tBErr.message}`);
  tenantBId = tB.id;

  // 2. Create auth users (email_confirm: true skips email flow)
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
    .insert({ id: userAId, tenant_id: tenantAId, nombre: 'User A', rol: 'admin' });
  if (pAErr) throw new Error(`profile A insert failed: ${pAErr.message}`);

  const { error: pBErr } = await admin
    .from('profiles')
    .insert({ id: userBId, tenant_id: tenantBId, nombre: 'User B', rol: 'admin' });
  if (pBErr) throw new Error(`profile B insert failed: ${pBErr.message}`);

  // 4. Seed resources for tenant A
  const { data: prodA, error: prodAErr } = await admin
    .from('products')
    .insert({
      tenant_id: tenantAId,
      nombre: `Product A ${UNIQUE}`,
      precio_unitario: 10.0,
      stock_actual: 50,
    })
    .select('id')
    .single();
  if (prodAErr) throw new Error(`product A insert failed: ${prodAErr.message}`);
  productAId = prodA.id;

  const { data: storeA, error: storeAErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantAId, nombre: `Store A ${UNIQUE}` })
    .select('id')
    .single();
  if (storeAErr) throw new Error(`store A insert failed: ${storeAErr.message}`);
  storeAId = storeA.id;

  // 5. Seed resources for tenant B
  const { data: prodB, error: prodBErr } = await admin
    .from('products')
    .insert({
      tenant_id: tenantBId,
      nombre: `Product B ${UNIQUE}`,
      precio_unitario: 20.0,
      stock_actual: 30,
    })
    .select('id')
    .single();
  if (prodBErr) throw new Error(`product B insert failed: ${prodBErr.message}`);
  productBId = prodB.id;

  const { data: storeB, error: storeBErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantBId, nombre: `Store B ${UNIQUE}` })
    .select('id')
    .single();
  if (storeBErr) throw new Error(`store B insert failed: ${storeBErr.message}`);
  storeBId = storeB.id;
});

// ---------------------------------------------------------------------------
// Teardown — clean up all fixtures
// ---------------------------------------------------------------------------
afterAll(async () => {
  // Delete auth users (cascades profiles via ON DELETE CASCADE)
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);

  // Delete tenants (cascades products, stores, orders, etc.)
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// Tests: Tenant A isolation
// ---------------------------------------------------------------------------
describe('RLS: Tenant A can read its own data', () => {
  it('user A sees tenant A products', async () => {
    const clientA = createBrowserStyleClient();
    const { error: signInErr } = await clientA.auth.signInWithPassword({
      email: userAEmail,
      password: PASSWORD,
    });
    if (signInErr) throw new Error(`sign-in A failed: ${signInErr.message}`);

    const { data, error } = await clientA
      .from('products')
      .select('id')
      .eq('id', productAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(productAId);

    await clientA.auth.signOut();
  });

  it('user A sees tenant A stores', async () => {
    const clientA = createBrowserStyleClient();
    await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });

    const { data, error } = await clientA
      .from('stores')
      .select('id')
      .eq('id', storeAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    await clientA.auth.signOut();
  });
});

describe('RLS: Tenant A CANNOT read Tenant B data', () => {
  it('user A gets zero rows when querying tenant B products', async () => {
    const clientA = createBrowserStyleClient();
    await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });

    const { data, error } = await clientA
      .from('products')
      .select('id')
      .eq('id', productBId);

    // Without RLS policies this returns the row → RED
    // With RLS policies active this returns [] → GREEN
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RED: row is visible before policies are applied

    await clientA.auth.signOut();
  });

  it('user A gets zero rows when querying tenant B stores', async () => {
    const clientA = createBrowserStyleClient();
    await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });

    const { data, error } = await clientA
      .from('stores')
      .select('id')
      .eq('id', storeBId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RED: row is visible before policies are applied

    await clientA.auth.signOut();
  });

  it('user A cannot INSERT a row into tenant B products', async () => {
    const clientA = createBrowserStyleClient();
    await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });

    const { error } = await clientA.from('products').insert({
      tenant_id: tenantBId,
      nombre: `Cross-tenant injection ${UNIQUE}`,
      precio_unitario: 1.0,
      stock_actual: 1,
    });

    // Without RLS policies: insert may succeed (catastrophic) → test fails on assert below
    // With RLS WITH CHECK: error code 42501 (insufficient privilege)
    expect(error).not.toBeNull(); // RED: no error returned before policies exist

    await clientA.auth.signOut();
  });

  it('user A cannot UPDATE a tenant B product row', async () => {
    const clientA = createBrowserStyleClient();
    await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });

    const { error } = await clientA
      .from('products')
      .update({ nombre: `Tampered ${UNIQUE}` })
      .eq('id', productBId);

    // Without RLS: update may succeed → RED
    // With RLS: returns error or 0 affected rows
    // We assert the update had zero effect by checking the product is unchanged
    const { data: check } = await admin
      .from('products')
      .select('nombre')
      .eq('id', productBId)
      .single();

    expect(check?.nombre).not.toContain('Tampered'); // RED: update goes through before RLS

    await clientA.auth.signOut();
  });
});

// ---------------------------------------------------------------------------
// Tests: Tenant B isolation (symmetric)
// ---------------------------------------------------------------------------
describe('RLS: Tenant B CANNOT read Tenant A data', () => {
  it('user B gets zero rows when querying tenant A products', async () => {
    const clientB = createBrowserStyleClient();
    await clientB.auth.signInWithPassword({ email: userBEmail, password: PASSWORD });

    const { data, error } = await clientB
      .from('products')
      .select('id')
      .eq('id', productAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RED: visible before RLS

    await clientB.auth.signOut();
  });

  it('user B gets zero rows when querying tenant A stores', async () => {
    const clientB = createBrowserStyleClient();
    await clientB.auth.signInWithPassword({ email: userBEmail, password: PASSWORD });

    const { data, error } = await clientB
      .from('stores')
      .select('id')
      .eq('id', storeAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RED: visible before RLS

    await clientB.auth.signOut();
  });
});

// ---------------------------------------------------------------------------
// Tests: profiles isolation
// ---------------------------------------------------------------------------
describe('RLS: profiles isolation', () => {
  it('user A can read own profile', async () => {
    const clientA = createBrowserStyleClient();
    await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });

    const { data, error } = await clientA
      .from('profiles')
      .select('id, tenant_id')
      .eq('id', userAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].tenant_id).toBe(tenantAId);

    await clientA.auth.signOut();
  });

  it('user A cannot read user B profile', async () => {
    const clientA = createBrowserStyleClient();
    await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });

    const { data, error } = await clientA
      .from('profiles')
      .select('id')
      .eq('id', userBId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RED: profile B visible before RLS

    await clientA.auth.signOut();
  });
});

// ---------------------------------------------------------------------------
// Tests: tenants isolation
// ---------------------------------------------------------------------------
describe('RLS: tenants isolation', () => {
  it('user A sees only tenant A in the tenants table', async () => {
    const clientA = createBrowserStyleClient();
    await clientA.auth.signInWithPassword({ email: userAEmail, password: PASSWORD });

    const { data, error } = await clientA
      .from('tenants')
      .select('id')
      .in('id', [tenantAId, tenantBId]);

    // With RLS: only tenantAId returned
    // Without RLS (RED): both returned
    expect(error).toBeNull();
    expect(data).toHaveLength(1); // RED: 2 rows returned before policies
    expect(data![0].id).toBe(tenantAId);

    await clientA.auth.signOut();
  });
});
