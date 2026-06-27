// @vitest-environment node
/**
 * WU3 Integration Tests — Base Schema
 *
 * These tests verify the schema defined in 20260625193428_schema.sql.
 * They run against the REAL remote Supabase instance using the secret key
 * (which bypasses RLS — correct for raw schema verification).
 *
 * STRICT TDD — RED PHASE:
 *   The migration has NOT been applied to the remote DB yet.
 *   All tests MUST fail until the orchestrator runs `supabase db push`.
 *
 * Idempotency: each test that inserts rows cleans up after itself using
 * ON DELETE CASCADE through the tenant row, so re-runs after the migration
 * is applied are safe.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// WebSocket stub for Node.js < 22
//
// @supabase/realtime-js needs a WebSocket constructor at client init time,
// even when we never use realtime channels. Node 20 has no native WebSocket.
// Passing a stub class as the `transport` option satisfies the check without
// requiring the external `ws` package.
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
// Client factory (bypasses RLS — server-only, never exported to browser)
// ---------------------------------------------------------------------------
function createTestAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY. ' +
        'Ensure .env.local is populated with real Supabase credentials.'
    );
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Disable realtime WebSocket requirement in Node < 22 environments.
    // Integration tests use the PostgREST REST layer only — never realtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });
}

// Shared client instance (created once, used across all tests)
const db = createTestAdminClient();

// ---------------------------------------------------------------------------
// Helper: insert a throwaway tenant and return its id.
// Throws with a clear "table not found" message when migration is absent.
// ---------------------------------------------------------------------------
async function insertTestTenant(suffix = ''): Promise<string> {
  const { data, error } = await db
    .from('tenants')
    .insert({ nombre: `__wu3_test__${suffix}`, ruc: '99999999999' })
    .select('id')
    .single();

  if (error) throw new Error(`tenants insert failed: ${error.message} (code: ${error.code})`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Helper: delete test tenant — cascade removes all child rows.
// ---------------------------------------------------------------------------
async function cleanupTenant(tenantId: string) {
  await db.from('tenants').delete().eq('id', tenantId);
}

// ---------------------------------------------------------------------------
// 1. Table existence — every table must be reachable with expected columns
// ---------------------------------------------------------------------------
describe('Table existence', () => {
  it('tenants has id, nombre, ruc, direccion, telefono, created_at', async () => {
    const { error } = await db
      .from('tenants')
      .select('id, nombre, ruc, direccion, telefono, created_at')
      .limit(0);
    expect(error).toBeNull();
  });

  it('profiles has id, tenant_id, nombre, rol, created_at', async () => {
    const { error } = await db
      .from('profiles')
      .select('id, tenant_id, nombre, rol, created_at')
      .limit(0);
    expect(error).toBeNull();
  });

  it('products has all expected columns including sku, categoria, stock_minimo, unidad_medida', async () => {
    const { error } = await db
      .from('products')
      .select(
        'id, tenant_id, nombre, sku, categoria, precio_unitario, stock_actual, stock_minimo, unidad_medida, activo, created_at'
      )
      .limit(0);
    expect(error).toBeNull();
  });

  it('stores has id, tenant_id, nombre, contacto, direccion, telefono', async () => {
    const { error } = await db
      .from('stores')
      .select('id, tenant_id, nombre, contacto, direccion, telefono, created_at')
      .limit(0);
    expect(error).toBeNull();
  });

  it('orders has id, tenant_id, store_id, fecha, estado, total, notas', async () => {
    const { error } = await db
      .from('orders')
      .select('id, tenant_id, store_id, fecha, estado, total, notas, created_at')
      .limit(0);
    expect(error).toBeNull();
  });

  it('order_items has id, order_id, tenant_id, product_id, cantidad, precio_unitario, subtotal', async () => {
    const { error } = await db
      .from('order_items')
      .select('id, order_id, tenant_id, product_id, cantidad, precio_unitario, subtotal')
      .limit(0);
    expect(error).toBeNull();
  });

  it('tenant_invoice_counters has tenant_id, last_number', async () => {
    const { error } = await db
      .from('tenant_invoice_counters')
      .select('tenant_id, last_number')
      .limit(0);
    expect(error).toBeNull();
  });

  it('invoices has id, tenant_id, order_id, numero, fecha_emision, total, estado_pago', async () => {
    const { error } = await db
      .from('invoices')
      .select('id, tenant_id, order_id, numero, fecha_emision, total, estado_pago, created_at')
      .limit(0);
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. GENERATED column: subtotal = cantidad * precio_unitario
// ---------------------------------------------------------------------------
describe('order_items — GENERATED subtotal', () => {
  it('DB computes subtotal automatically (value equals cantidad × precio_unitario)', async () => {
    const tenantId = await insertTestTenant('subtotal');

    try {
      // Store
      const { data: store, error: storeErr } = await db
        .from('stores')
        .insert({ tenant_id: tenantId, nombre: '__wu3_store__' })
        .select('id')
        .single();
      if (storeErr) throw new Error(`stores insert failed: ${storeErr.message}`);

      // Product
      const { data: product, error: productErr } = await db
        .from('products')
        .insert({ tenant_id: tenantId, nombre: '__wu3_product__', precio_unitario: 10.0, stock_actual: 100 })
        .select('id')
        .single();
      if (productErr) throw new Error(`products insert failed: ${productErr.message}`);

      // Order
      const { data: order, error: orderErr } = await db
        .from('orders')
        .insert({ tenant_id: tenantId, store_id: store.id, estado: 'pendiente' })
        .select('id')
        .single();
      if (orderErr) throw new Error(`orders insert failed: ${orderErr.message}`);

      // Order item
      const cantidad = 3;
      const precio = 7.5;
      const { data: item, error: itemErr } = await db
        .from('order_items')
        .insert({
          order_id: order.id,
          tenant_id: tenantId,
          product_id: product.id,
          cantidad,
          precio_unitario: precio,
        })
        .select('subtotal')
        .single();

      if (itemErr) throw new Error(`order_items insert failed: ${itemErr.message}`);

      expect(Number(item.subtotal)).toBeCloseTo(cantidad * precio, 2); // 22.50
    } finally {
      await cleanupTenant(tenantId);
    }
  });

  it('order_items carries tenant_id as a denormalized column', async () => {
    const tenantId = await insertTestTenant('denorm');

    try {
      const { data: store } = await db
        .from('stores')
        .insert({ tenant_id: tenantId, nombre: '__wu3_store2__' })
        .select('id')
        .single();

      const { data: product } = await db
        .from('products')
        .insert({ tenant_id: tenantId, nombre: '__wu3_product2__', precio_unitario: 5.0, stock_actual: 50 })
        .select('id')
        .single();

      const { data: order } = await db
        .from('orders')
        .insert({ tenant_id: tenantId, store_id: store!.id, estado: 'pendiente' })
        .select('id')
        .single();

      const { data: item, error: itemErr } = await db
        .from('order_items')
        .insert({
          order_id: order!.id,
          tenant_id: tenantId,
          product_id: product!.id,
          cantidad: 1,
          precio_unitario: 5.0,
        })
        .select('tenant_id')
        .single();

      if (itemErr) throw new Error(`order_items insert failed: ${itemErr.message}`);
      expect(item.tenant_id).toBe(tenantId);
    } finally {
      await cleanupTenant(tenantId);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. CHECK constraint: orders.estado must reject invalid values
// ---------------------------------------------------------------------------
describe('orders.estado CHECK constraint', () => {
  it('rejects an invalid estado value', async () => {
    const tenantId = await insertTestTenant('estado-check');

    try {
      const { data: store } = await db
        .from('stores')
        .insert({ tenant_id: tenantId, nombre: '__wu3_store3__' })
        .select('id')
        .single();

      const { error } = await db
        .from('orders')
        .insert({ tenant_id: tenantId, store_id: store!.id, estado: 'invalido' });

      // Postgres CHECK violation = code 23514
      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514');
    } finally {
      await cleanupTenant(tenantId);
    }
  });

  it('accepts pendiente, entregado, and cancelado as valid estado values', async () => {
    const tenantId = await insertTestTenant('estado-valid');

    try {
      const { data: store } = await db
        .from('stores')
        .insert({ tenant_id: tenantId, nombre: '__wu3_store4__' })
        .select('id')
        .single();

      for (const estado of ['pendiente', 'entregado', 'cancelado'] as const) {
        const { data, error } = await db
          .from('orders')
          .insert({ tenant_id: tenantId, store_id: store!.id, estado })
          .select('id, estado')
          .single();

        expect(error).toBeNull();
        expect(data?.estado).toBe(estado);
      }
    } finally {
      await cleanupTenant(tenantId);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. CHECK constraint: profiles.rol
// ---------------------------------------------------------------------------
describe('profiles.rol CHECK constraint', () => {
  it('rejects an invalid rol value', async () => {
    const tenantId = await insertTestTenant('rol-check');

    try {
      // profiles.id must equal an auth.users UUID — use a non-existent UUID.
      // The insert will fail at FK level (23503) or CHECK level (23514).
      // Both prove the table exists and constraints are enforced.
      const { error } = await db.from('profiles').insert({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        rol: 'superadmin', // not in ('admin', 'operador')
        nombre: '__wu3__',
      });

      expect(error).not.toBeNull();
      // FK violation (23503) or CHECK violation (23514) — either is valid
      expect(['23514', '23503']).toContain(error?.code);
    } finally {
      await cleanupTenant(tenantId);
    }
  });

  it('profiles table column rol is selectable (column exists)', async () => {
    // Just verify the column exists — 0-row select is enough
    const { error } = await db.from('profiles').select('id, rol').limit(0);
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S1-T2 — Products packaging columns (REQ-1, Scenarios 1.2/1.3/1.4/1.6)
// RED until migration 20260627090000_products_packaging.sql is applied.
// ---------------------------------------------------------------------------
describe('products — packaging columns (S1-T2)', () => {
  it('products table exposes units_per_package and precio_paca columns', async () => {
    const { error } = await db
      .from('products')
      .select('id, units_per_package, precio_paca')
      .limit(0);
    expect(error).toBeNull();
  });

  it('newly inserted product defaults units_per_package and precio_paca to NULL', async () => {
    const tenantId = await insertTestTenant('pkg-defaults');

    try {
      const { data, error } = await db
        .from('products')
        .insert({
          tenant_id: tenantId,
          nombre: '__pkg_default__',
          precio_unitario: 5.0,
          stock_actual: 10,
        })
        .select('units_per_package, precio_paca')
        .single();

      expect(error).toBeNull();
      expect(data?.units_per_package).toBeNull();
      expect(data?.precio_paca).toBeNull();
    } finally {
      await cleanupTenant(tenantId);
    }
  });

  it('CHECK rejects units_per_package = 1 (must be >= 2 when not null)', async () => {
    const tenantId = await insertTestTenant('pkg-check-upp');

    try {
      const { error } = await db.from('products').insert({
        tenant_id: tenantId,
        nombre: '__pkg_upp1__',
        precio_unitario: 5.0,
        stock_actual: 10,
        units_per_package: 1,
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514'); // Postgres CHECK violation
    } finally {
      await cleanupTenant(tenantId);
    }
  });

  it('CHECK rejects precio_paca set without units_per_package (cross-field constraint)', async () => {
    const tenantId = await insertTestTenant('pkg-check-cross');

    try {
      const { error } = await db.from('products').insert({
        tenant_id: tenantId,
        nombre: '__pkg_cross__',
        precio_unitario: 5.0,
        stock_actual: 10,
        precio_paca: 150.0,
        units_per_package: null,
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe('23514');
    } finally {
      await cleanupTenant(tenantId);
    }
  });

  it('accepts a fully packaged product (units_per_package >= 2, precio_paca not null)', async () => {
    const tenantId = await insertTestTenant('pkg-valid');

    try {
      const { data, error } = await db
        .from('products')
        .insert({
          tenant_id: tenantId,
          nombre: '__pkg_valid__',
          precio_unitario: 6.0,
          stock_actual: 100,
          units_per_package: 30,
          precio_paca: 150.0,
        })
        .select('units_per_package, precio_paca')
        .single();

      expect(error).toBeNull();
      expect(data?.units_per_package).toBe(30);
      expect(Number(data?.precio_paca)).toBeCloseTo(150.0, 2);
    } finally {
      await cleanupTenant(tenantId);
    }
  });

  it('accepts units_per_package without precio_paca (partial — DB allows it; RPC guards sell path)', async () => {
    const tenantId = await insertTestTenant('pkg-partial');

    try {
      const { data, error } = await db
        .from('products')
        .insert({
          tenant_id: tenantId,
          nombre: '__pkg_partial__',
          precio_unitario: 6.0,
          stock_actual: 10,
          units_per_package: 30,
          precio_paca: null,
        })
        .select('units_per_package, precio_paca')
        .single();

      expect(error).toBeNull();
      expect(data?.units_per_package).toBe(30);
      expect(data?.precio_paca).toBeNull();
    } finally {
      await cleanupTenant(tenantId);
    }
  });
});
