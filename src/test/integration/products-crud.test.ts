// @vitest-environment node
/**
 * Integration Tests — Product CRUD via data seam (real Supabase DB)
 *
 * Verifies R1–R4, R8:
 *   - createProduct → visible in getProducts
 *   - updateProduct → reflected in getProduct
 *   - deleteProduct → soft-delete: excluded from getProducts; row persists with
 *     activo=false; referencing order_items remain intact (no FK violation)
 *   - Cross-tenant isolation: tenant B cannot read or modify tenant A's products
 *
 * Provisions two tenants (A and B) + a store for the FK sub-test.
 * Cleans up everything in afterAll via admin client cascade delete.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
  getProduct,
} from '@/lib/data/products';

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

let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;
let userAEmail: string;
let userBEmail: string;
let storeAId: string;

let clientA: SupabaseClient;
let clientB: SupabaseClient;

// Populated by tests — sequential within file
let productId: string;

// ---------------------------------------------------------------------------
// Setup — provision two isolated tenants, users, and a store for FK tests
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userAEmail = `crud-a+${UNIQUE}@stockio.test`;
  userBEmail = `crud-b+${UNIQUE}@stockio.test`;

  // Tenants
  const { data: tA, error: tAErr } = await admin
    .from('tenants')
    .insert({ nombre: `__crud_tenant_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (tAErr) throw new Error(`tenant A: ${tAErr.message}`);
  tenantAId = tA.id;

  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__crud_tenant_b_${UNIQUE}__` })
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
    .insert({ id: userAId, tenant_id: tenantAId, nombre: 'Crud User A', rol: 'admin' });
  if (pAErr) throw new Error(`profile A: ${pAErr.message}`);

  const { error: pBErr } = await admin
    .from('profiles')
    .insert({ id: userBId, tenant_id: tenantBId, nombre: 'Crud User B', rol: 'admin' });
  if (pBErr) throw new Error(`profile B: ${pBErr.message}`);

  // Store for tenant A (needed for order FK test)
  const { data: s, error: sErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantAId, nombre: `__crud_store_${UNIQUE}__` })
    .select('id')
    .single();
  if (sErr) throw new Error(`store A: ${sErr.message}`);
  storeAId = s.id;

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
  await clientA.auth.signOut().catch(() => {});
  await clientB.auth.signOut().catch(() => {});
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  // CASCADE deletes products, stores, orders, order_items
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// R1 — Create
// ---------------------------------------------------------------------------
describe('createProduct', () => {
  it('creates a product and returns it with activo=true', async () => {
    const product = await createProduct(clientA, {
      nombre: `Prod CRUD ${UNIQUE}`,
      sku: `SKU-${UNIQUE}`,
      categoria: 'Test',
      precio_unitario: 9.99,
      stock_actual: 50,
      stock_minimo: 5,
      unidad_medida: 'kg',
    });

    expect(product.id).toBeDefined();
    expect(product.nombre).toBe(`Prod CRUD ${UNIQUE}`);
    expect(product.activo).toBe(true);
    expect(product.tenant_id).toBeDefined();

    productId = product.id;
  });

  it('does not include tenant_id in the client payload (RLS fills it)', async () => {
    // Verified by reading the created product — its tenant_id is set from the
    // authenticated session, not from a client-supplied value.
    const product = await getProduct(clientA, productId);
    expect(product).not.toBeNull();
    expect(product!.tenant_id).toBe(tenantAId);
  });
});

// ---------------------------------------------------------------------------
// R2 — List
// ---------------------------------------------------------------------------
describe('getProducts — after create', () => {
  it('includes the new product in the active product list', async () => {
    const products = await getProducts(clientA);
    const found = products.find((p) => p.id === productId);
    expect(found).toBeDefined();
    expect(found!.nombre).toBe(`Prod CRUD ${UNIQUE}`);
  });
});

// ---------------------------------------------------------------------------
// R3 — Update
// ---------------------------------------------------------------------------
describe('updateProduct', () => {
  it('persists changes and returns the updated product', async () => {
    const updated = await updateProduct(clientA, productId, {
      nombre: `Prod CRUD Updated ${UNIQUE}`,
      sku: `SKU-UPD-${UNIQUE}`,
      categoria: 'Test Updated',
      precio_unitario: 14.99,
      stock_actual: 55,
      stock_minimo: 8,
      unidad_medida: 'unidad',
    });

    expect(updated.nombre).toBe(`Prod CRUD Updated ${UNIQUE}`);
    expect(updated.precio_unitario).toBe(14.99);
    expect(updated.stock_actual).toBe(55);
  });

  it('getProduct reflects the updated values', async () => {
    const product = await getProduct(clientA, productId);
    expect(product!.nombre).toBe(`Prod CRUD Updated ${UNIQUE}`);
    expect(product!.precio_unitario).toBe(14.99);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant isolation (R3 / R8)
// ---------------------------------------------------------------------------
describe('cross-tenant isolation', () => {
  it('tenant B cannot see tenant A products via getProducts', async () => {
    const bProducts = await getProducts(clientB);
    const tenantAProduct = bProducts.find((p) => p.id === productId);
    expect(tenantAProduct).toBeUndefined();
  });

  it('tenant B update of tenant A product has no effect', async () => {
    // RLS blocks the update — 0 rows affected or PGRST116 error
    try {
      await updateProduct(clientB, productId, {
        nombre: 'Tampered by B',
        precio_unitario: 0.01,
        stock_actual: 0,
        stock_minimo: 0,
      });
    } catch {
      // Expected — RLS returns error on 0 rows with .single()
    }

    // Verify product is unchanged via admin
    const { data: row } = await admin
      .from('products')
      .select('nombre')
      .eq('id', productId)
      .single();
    expect(row?.nombre).not.toBe('Tampered by B');
  });
});

// ---------------------------------------------------------------------------
// R4 — Soft delete (with FK integrity check)
// ---------------------------------------------------------------------------
describe('deleteProduct (soft delete)', () => {
  let orderId: string;

  it('creates an order_item referencing the product (FK setup)', async () => {
    // Insert an order via admin
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .insert({
        tenant_id: tenantAId,
        store_id: storeAId,
        fecha: '2026-01-01',
        estado: 'pendiente',
      })
      .select('id')
      .single();
    if (orderErr) throw new Error(`order: ${orderErr.message}`);
    orderId = order.id;

    // Insert an order_item referencing the product
    const { error: itemErr } = await admin.from('order_items').insert({
      order_id: orderId,
      tenant_id: tenantAId,
      product_id: productId,
      precio_unitario: 14.99,
      cantidad: 2,
    });
    if (itemErr) throw new Error(`order_item: ${itemErr.message}`);

    const { data: item } = await admin
      .from('order_items')
      .select('product_id')
      .eq('order_id', orderId)
      .single();
    expect(item?.product_id).toBe(productId);
  });

  it('soft-deletes the product without throwing', async () => {
    await expect(deleteProduct(clientA, productId)).resolves.toBeUndefined();
  });

  it('soft-deleted product no longer appears in getProducts', async () => {
    const products = await getProducts(clientA);
    const found = products.find((p) => p.id === productId);
    expect(found).toBeUndefined();
  });

  it('soft-deleted product row still exists with activo=false', async () => {
    const { data: row } = await admin
      .from('products')
      .select('activo')
      .eq('id', productId)
      .single();
    expect(row?.activo).toBe(false);
  });

  it('order_items referencing the soft-deleted product remain intact', async () => {
    const { data: items, error } = await admin
      .from('order_items')
      .select('product_id')
      .eq('order_id', orderId);
    expect(error).toBeNull();
    expect(items).toHaveLength(1);
    expect(items![0].product_id).toBe(productId);
  });
});
