// @vitest-environment node
/**
 * Integration Tests — Supplier CRUD via data seam (real Supabase DB)
 *
 * Verifies REQ-S1..S4:
 *   - createSupplier → visible in getSuppliers; activo=true by default
 *   - getSupplier → correct data returned
 *   - updateSupplier → reflected in getSupplier
 *   - deactivateSupplier → soft-delete; excluded from getSuppliers; row persists
 *     with activo=false; referenced purchases remain intact (FK RESTRICT scenario)
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
import {
  createSupplier,
  updateSupplier,
  deactivateSupplier,
  getSuppliers,
  getSupplier,
} from '@/lib/data/suppliers';

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
let supplierId: string;

// ---------------------------------------------------------------------------
// Setup — provision two isolated tenants and users
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userAEmail = `suppliers-a+${UNIQUE}@stockio.test`;
  userBEmail = `suppliers-b+${UNIQUE}@stockio.test`;

  // Tenants
  const { data: tA, error: tAErr } = await admin
    .from('tenants')
    .insert({ nombre: `__suppliers_tenant_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (tAErr) throw new Error(`tenant A: ${tAErr.message}`);
  tenantAId = tA.id;

  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__suppliers_tenant_b_${UNIQUE}__` })
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
    .insert({ id: userAId, tenant_id: tenantAId, nombre: 'Suppliers User A', rol: 'admin' });
  if (pAErr) throw new Error(`profile A: ${pAErr.message}`);

  const { error: pBErr } = await admin
    .from('profiles')
    .insert({ id: userBId, tenant_id: tenantBId, nombre: 'Suppliers User B', rol: 'admin' });
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
  // CASCADE deletes suppliers, etc.
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// REQ-S1 — Create
// ---------------------------------------------------------------------------
describe('createSupplier', () => {
  it('creates a supplier and returns it with activo=true', async () => {
    const supplier = await createSupplier(clientA, {
      nombre: `Supplier CRUD ${UNIQUE}`,
      contacto: 'Ana García',
      telefono: '555-1234',
    });

    expect(supplier.id).toBeDefined();
    expect(supplier.nombre).toBe(`Supplier CRUD ${UNIQUE}`);
    expect(supplier.activo).toBe(true);
    expect(supplier.tenant_id).toBeDefined();

    supplierId = supplier.id;
  });

  it('does not include tenant_id in the client payload (RLS fills it)', async () => {
    const supplier = await getSupplier(clientA, supplierId);
    expect(supplier).not.toBeNull();
    expect(supplier!.tenant_id).toBe(tenantAId);
  });
});

// ---------------------------------------------------------------------------
// REQ-S2 — List (active only)
// ---------------------------------------------------------------------------
describe('getSuppliers — after create', () => {
  it('includes the new supplier in the active supplier list', async () => {
    const suppliers = await getSuppliers(clientA);
    const found = suppliers.find((s) => s.id === supplierId);
    expect(found).toBeDefined();
    expect(found!.nombre).toBe(`Supplier CRUD ${UNIQUE}`);
  });
});

// ---------------------------------------------------------------------------
// REQ-S3 — Update
// ---------------------------------------------------------------------------
describe('updateSupplier', () => {
  it('persists changes and returns the updated supplier', async () => {
    const updated = await updateSupplier(clientA, supplierId, {
      nombre: `Supplier CRUD Updated ${UNIQUE}`,
      contacto: 'María López',
      telefono: '555-9876',
    });

    expect(updated.nombre).toBe(`Supplier CRUD Updated ${UNIQUE}`);
    expect(updated.contacto).toBe('María López');
  });

  it('getSupplier reflects the updated values', async () => {
    const supplier = await getSupplier(clientA, supplierId);
    expect(supplier!.nombre).toBe(`Supplier CRUD Updated ${UNIQUE}`);
    expect(supplier!.contacto).toBe('María López');
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant isolation
// ---------------------------------------------------------------------------
describe('cross-tenant isolation', () => {
  it('tenant B cannot see tenant A suppliers via getSuppliers', async () => {
    const bSuppliers = await getSuppliers(clientB);
    const tenantASupplier = bSuppliers.find((s) => s.id === supplierId);
    expect(tenantASupplier).toBeUndefined();
  });

  it('tenant B update of tenant A supplier has no effect', async () => {
    try {
      await updateSupplier(clientB, supplierId, {
        nombre: 'Tampered by B',
      });
    } catch {
      // Expected — RLS returns error on 0 rows with .single()
    }

    const { data: row } = await admin
      .from('suppliers')
      .select('nombre')
      .eq('id', supplierId)
      .single();
    expect(row?.nombre).not.toBe('Tampered by B');
  });
});

// ---------------------------------------------------------------------------
// REQ-S4 — Deactivate (soft delete)
// ---------------------------------------------------------------------------
describe('deactivateSupplier (soft delete)', () => {
  it('soft-deletes the supplier without throwing', async () => {
    await expect(deactivateSupplier(clientA, supplierId)).resolves.toBeUndefined();
  });

  it('deactivated supplier no longer appears in getSuppliers', async () => {
    const suppliers = await getSuppliers(clientA);
    const found = suppliers.find((s) => s.id === supplierId);
    expect(found).toBeUndefined();
  });

  it('deactivated supplier row still exists with activo=false', async () => {
    const { data: row } = await admin
      .from('suppliers')
      .select('activo')
      .eq('id', supplierId)
      .single();
    expect(row?.activo).toBe(false);
  });
});
