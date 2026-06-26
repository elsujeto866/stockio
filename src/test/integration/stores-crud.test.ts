// @vitest-environment node
/**
 * Integration Tests — Store CRUD via data seam (real Supabase DB)
 *
 * Verifies R1–R4, R6:
 *   - createStore → visible in getStores
 *   - updateStore → reflected in getStore
 *   - deleteStore → soft-delete: excluded from getStores; row persists with
 *     activo=false; referencing orders remain intact (no FK violation)
 *   - Cross-tenant isolation: tenant B cannot read or modify tenant A's stores
 *
 * Provisions two tenants (A and B).
 * Cleans up everything in afterAll via admin client cascade delete.
 *
 * NOTE: These tests require migration 20260626000000_stores_activo.sql to be
 * applied to the remote DB before they can pass. Until the orchestrator pushes
 * the migration, they will fail with "column activo does not exist". This is
 * expected — RED is correct at WU-A authoring time.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createStore,
  updateStore,
  deleteStore,
  getStores,
  getStore,
} from '@/lib/data/stores';

// ---------------------------------------------------------------------------
// WebSocket stub (same pattern as other integration tests)
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
// Unique suffix per run
// ---------------------------------------------------------------------------
const UNIQUE = Date.now().toString(36);

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
    throw new Error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
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

let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;
let userAEmail: string;
let userBEmail: string;

let clientA: SupabaseClient;
let clientB: SupabaseClient;

// Populated by tests — sequential within file
let storeId: string;

// ---------------------------------------------------------------------------
// Setup — provision two isolated tenants and users
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userAEmail = `stores-a+${UNIQUE}@stockio.test`;
  userBEmail = `stores-b+${UNIQUE}@stockio.test`;

  // Tenants
  const { data: tA, error: tAErr } = await admin
    .from('tenants')
    .insert({ nombre: `__stores_tenant_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (tAErr) throw new Error(`tenant A: ${tAErr.message}`);
  tenantAId = tA.id;

  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__stores_tenant_b_${UNIQUE}__` })
    .select('id')
    .single();
  if (tBErr) throw new Error(`tenant B: ${tBErr.message}`);
  tenantBId = tB.id;

  // Auth users
  const { data: uA, error: uAErr } = await admin.auth.admin.createUser({
    email: userAEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uAErr) throw new Error(`user A: ${uAErr.message}`);
  userAId = uA.user.id;

  const { data: uB, error: uBErr } = await admin.auth.admin.createUser({
    email: userBEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uBErr) throw new Error(`user B: ${uBErr.message}`);
  userBId = uB.user.id;

  // Profiles
  const { error: pAErr } = await admin
    .from('profiles')
    .insert({ id: userAId, tenant_id: tenantAId, nombre: 'Stores User A', rol: 'admin' });
  if (pAErr) throw new Error(`profile A: ${pAErr.message}`);

  const { error: pBErr } = await admin
    .from('profiles')
    .insert({ id: userBId, tenant_id: tenantBId, nombre: 'Stores User B', rol: 'admin' });
  if (pBErr) throw new Error(`profile B: ${pBErr.message}`);

  // Authenticate browser clients
  clientA = createBrowserStyleClient();
  const { error: signInAErr } = await clientA.auth.signInWithPassword({
    email: userAEmail,
    password: PASSWORD,
  });
  if (signInAErr) throw new Error(`sign-in A: ${signInAErr.message}`);

  clientB = createBrowserStyleClient();
  const { error: signInBErr } = await clientB.auth.signInWithPassword({
    email: userBEmail,
    password: PASSWORD,
  });
  if (signInBErr) throw new Error(`sign-in B: ${signInBErr.message}`);
}, 30_000);

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
afterAll(async () => {
  await clientA?.auth.signOut().catch(() => {});
  await clientB?.auth.signOut().catch(() => {});
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  // CASCADE deletes stores, orders, etc.
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// R1 — Create
// ---------------------------------------------------------------------------
describe('createStore', () => {
  it('creates a store and returns it with activo=true', async () => {
    const store = await createStore(clientA, {
      nombre: `Store CRUD ${UNIQUE}`,
      contacto: '555-1234',
      direccion: 'Av. Test 123',
      telefono: '555-9999',
    });

    expect(store.id).toBeDefined();
    expect(store.nombre).toBe(`Store CRUD ${UNIQUE}`);
    expect(store.activo).toBe(true);
    expect(store.tenant_id).toBeDefined();

    storeId = store.id;
  });

  it('does not include tenant_id in the client payload (RLS fills it)', async () => {
    const store = await getStore(clientA, storeId);
    expect(store).not.toBeNull();
    expect(store!.tenant_id).toBe(tenantAId);
  });
});

// ---------------------------------------------------------------------------
// R2 — List
// ---------------------------------------------------------------------------
describe('getStores — after create', () => {
  it('includes the new store in the active store list', async () => {
    const stores = await getStores(clientA);
    const found = stores.find((s) => s.id === storeId);
    expect(found).toBeDefined();
    expect(found!.nombre).toBe(`Store CRUD ${UNIQUE}`);
  });
});

// ---------------------------------------------------------------------------
// R3 — Update
// ---------------------------------------------------------------------------
describe('updateStore', () => {
  it('persists changes and returns the updated store', async () => {
    const updated = await updateStore(clientA, storeId, {
      nombre: `Store CRUD Updated ${UNIQUE}`,
      contacto: '555-9876',
      direccion: 'Av. Updated 456',
      telefono: '555-0000',
    });

    expect(updated.nombre).toBe(`Store CRUD Updated ${UNIQUE}`);
    expect(updated.contacto).toBe('555-9876');
  });

  it('getStore reflects the updated values', async () => {
    const store = await getStore(clientA, storeId);
    expect(store!.nombre).toBe(`Store CRUD Updated ${UNIQUE}`);
    expect(store!.contacto).toBe('555-9876');
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant isolation (R6)
// ---------------------------------------------------------------------------
describe('cross-tenant isolation', () => {
  it('tenant B cannot see tenant A stores via getStores', async () => {
    const bStores = await getStores(clientB);
    const tenantAStore = bStores.find((s) => s.id === storeId);
    expect(tenantAStore).toBeUndefined();
  });

  it('tenant B update of tenant A store has no effect', async () => {
    // RLS blocks the update — 0 rows affected or PGRST116 error with .single()
    try {
      await updateStore(clientB, storeId, {
        nombre: 'Tampered by B',
      });
    } catch {
      // Expected — RLS returns error on 0 rows with .single()
    }

    // Verify store is unchanged via admin
    const { data: row } = await admin
      .from('stores')
      .select('nombre')
      .eq('id', storeId)
      .single();
    expect(row?.nombre).not.toBe('Tampered by B');
  });
});

// ---------------------------------------------------------------------------
// R4 — Soft delete (with FK integrity check)
// ---------------------------------------------------------------------------
describe('deleteStore (soft delete)', () => {
  let orderId: string;

  it('creates an order referencing the store (FK setup)', async () => {
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .insert({
        tenant_id: tenantAId,
        store_id: storeId,
        fecha: '2026-01-01',
        estado: 'pendiente',
      })
      .select('id')
      .single();
    if (orderErr) throw new Error(`order: ${orderErr.message}`);
    orderId = order.id;

    const { data: o } = await admin
      .from('orders')
      .select('store_id')
      .eq('id', orderId)
      .single();
    expect(o?.store_id).toBe(storeId);
  });

  it('soft-deletes the store without throwing', async () => {
    await expect(deleteStore(clientA, storeId)).resolves.toBeUndefined();
  });

  it('soft-deleted store no longer appears in getStores', async () => {
    const stores = await getStores(clientA);
    const found = stores.find((s) => s.id === storeId);
    expect(found).toBeUndefined();
  });

  it('soft-deleted store row still exists with activo=false', async () => {
    const { data: row } = await admin
      .from('stores')
      .select('activo')
      .eq('id', storeId)
      .single();
    expect(row?.activo).toBe(false);
  });

  it('orders referencing the soft-deleted store remain intact (no FK break)', async () => {
    const { data: orders, error } = await admin
      .from('orders')
      .select('store_id')
      .eq('id', orderId);
    expect(error).toBeNull();
    expect(orders).toHaveLength(1);
    expect(orders![0].store_id).toBe(storeId);
  });
});
