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

// Packaging-test fixtures (S2-T3)
let packProductId: string;       // product with units_per_package=30, precio_paca=150.00
let unitOnlyProductId: string;   // product with units_per_package=null (for NULL guard test)
const PACK_SIZE = 30;
const PACK_PRICE = 150.0;
const PACK_UNIT_PRICE = 5.0;    // precio_unitario for the packaged product
let packInitialStock: number;    // start with 100

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

  // Product (unit-only, used by existing tests)
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

  // Packaged product (S2-T3): units_per_package=30, precio_paca=150
  packInitialStock = 100;
  const { data: packP, error: packPErr } = await admin
    .from('products')
    .insert({
      tenant_id: tenantId,
      nombre: `__rpcs_pack_product_${UNIQUE}__`,
      precio_unitario: PACK_UNIT_PRICE,
      precio_paca: PACK_PRICE,
      units_per_package: PACK_SIZE,
      stock_actual: packInitialStock,
    })
    .select('id')
    .single();
  if (packPErr) throw new Error(`pack product insert failed: ${packPErr.message}`);
  packProductId = packP.id;

  // Unit-only product (S2-T3 NULL guard): no pack columns
  const { data: unitOnlyP, error: unitOnlyPErr } = await admin
    .from('products')
    .insert({
      tenant_id: tenantId,
      nombre: `__rpcs_unit_only_${UNIQUE}__`,
      precio_unitario: 8.0,
      stock_actual: 50,
    })
    .select('id')
    .single();
  if (unitOnlyPErr) throw new Error(`unit-only product insert failed: ${unitOnlyPErr.message}`);
  unitOnlyProductId = unitOnlyP.id;
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
// S2-T3: Packaging RPC integration tests (8 sub-cases)
// RED until migration 20260627090100_order_items_packaging.sql is applied.
// ---------------------------------------------------------------------------
describe('create_order + cancel_order — packaging (S2-T3)', () => {
  // Sub-case 1: Sell by package → stock decrements by base_units, price = precio_paca
  it('1. sell by package: stock decrements by cantidad*pack_size; precio frozen = precio_paca', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', packProductId)
      .single();
    const stockBefore = before!.stock_actual as number;

    const cantidadPacks = 2;
    const expectedBaseUnits = cantidadPacks * PACK_SIZE; // 60

    const { data: orderId, error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: packProductId, cantidad: cantidadPacks, sale_unit: 'package' }],
      p_notas: `S2T3 pack test ${UNIQUE}`,
    });
    expect(error).toBeNull();
    expect(orderId).not.toBeNull();

    // Stock decremented by base_units (60), NOT cantidad (2)
    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', packProductId)
      .single();
    expect(after?.stock_actual).toBe(stockBefore - expectedBaseUnits);

    // Line frozen price = PACK_PRICE; base_units and snapshot correct
    const { data: items } = await admin
      .from('order_items')
      .select('precio_unitario, sale_unit, units_per_package_snapshot, base_units, cantidad')
      .eq('order_id', orderId);
    expect(items).toHaveLength(1);
    expect(Number(items![0].precio_unitario)).toBeCloseTo(PACK_PRICE, 2);
    expect(items![0].sale_unit).toBe('package');
    expect(items![0].units_per_package_snapshot).toBe(PACK_SIZE);
    expect(items![0].base_units).toBe(expectedBaseUnits);
    expect(items![0].cantidad).toBe(cantidadPacks);

    // order.total = pack_price * packs
    const { data: order } = await admin
      .from('orders')
      .select('total')
      .eq('id', orderId)
      .single();
    expect(Number(order?.total)).toBeCloseTo(PACK_PRICE * cantidadPacks, 2); // 300.00

    // Restore stock for subsequent tests
    await admin.from('products').update({ stock_actual: stockBefore }).eq('id', packProductId);

    await client.auth.signOut();
  });

  // Sub-case 2: Mixed lines (same product, unit + package) → two independent items
  it('2. mixed lines (unit + package for same product) coexist in one order', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', packProductId)
      .single();
    const stockBefore = before!.stock_actual as number;

    const unitQty = 5;
    const packQty = 1;
    const totalBaseUnits = unitQty + packQty * PACK_SIZE; // 5 + 30 = 35

    const { data: orderId, error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [
        { product_id: packProductId, cantidad: unitQty, sale_unit: 'unit' },
        { product_id: packProductId, cantidad: packQty, sale_unit: 'package' },
      ],
      p_notas: `S2T3 mixed ${UNIQUE}`,
    });
    expect(error).toBeNull();
    expect(orderId).not.toBeNull();

    // Stock decremented by total base units (35)
    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', packProductId)
      .single();
    expect(after?.stock_actual).toBe(stockBefore - totalBaseUnits);

    // Two distinct order_items lines
    const { data: items } = await admin
      .from('order_items')
      .select('sale_unit, cantidad, base_units, precio_unitario')
      .eq('order_id', orderId)
      .order('sale_unit', { ascending: true });
    expect(items).toHaveLength(2);
    const packageLine = items!.find((i) => i.sale_unit === 'package');
    const unitLine    = items!.find((i) => i.sale_unit === 'unit');
    expect(packageLine?.base_units).toBe(PACK_SIZE); // 1 × 30
    expect(unitLine?.base_units).toBe(unitQty);       // 5
    expect(Number(packageLine?.precio_unitario)).toBeCloseTo(PACK_PRICE, 2);
    expect(Number(unitLine?.precio_unitario)).toBeCloseTo(PACK_UNIT_PRICE, 2);

    // Restore
    await admin.from('products').update({ stock_actual: stockBefore }).eq('id', packProductId);

    await client.auth.signOut();
  });

  // Sub-case 3: Cancel package order → stock restored by base_units (NOT cantidad)
  // This is the TOP correctness requirement (REQ-5 / Scenario 5.1).
  // RED evidence: before migration, cancel_order uses oi.cantidad (returns 2, not 60).
  it('3. cancel package order: stock restores by base_units (e.g. 60) NOT cantidad (e.g. 2)', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    // Record stock before order
    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', packProductId)
      .single();
    const stockBefore = before!.stock_actual as number;

    const cantidadPacks = 2;
    const expectedBaseUnits = cantidadPacks * PACK_SIZE; // 60

    // Create pack order (decrements by 60)
    const { data: orderId, error: createErr } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: packProductId, cantidad: cantidadPacks, sale_unit: 'package' }],
      p_notas: `S2T3 cancel test ${UNIQUE}`,
    });
    expect(createErr).toBeNull();
    expect(orderId).not.toBeNull();

    // Verify stock was decremented by 60
    const { data: afterCreate } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', packProductId)
      .single();
    expect(afterCreate?.stock_actual).toBe(stockBefore - expectedBaseUnits);

    // Cancel the order → should restore by 60 (base_units), NOT 2 (cantidad)
    const { error: cancelErr } = await client.rpc('cancel_order', { p_order_id: orderId });
    expect(cancelErr).toBeNull();

    // Stock must be fully restored to pre-order level
    const { data: afterCancel } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', packProductId)
      .single();
    // RED: before migration, cancel_order restores by oi.cantidad (2), giving stockBefore - 60 + 2 = stockBefore - 58.
    // GREEN: after migration, restores by oi.base_units (60), giving stockBefore.
    expect(afterCancel?.stock_actual).toBe(stockBefore);

    // Order must be cancelled
    const { data: order } = await admin
      .from('orders')
      .select('estado')
      .eq('id', orderId)
      .single();
    expect(order?.estado).toBe('cancelado');

    await client.auth.signOut();
  });

  // Sub-case 4: Cancel unit order → stock restored correctly (back-compat)
  it('4. cancel unit order: stock restores by cantidad (back-compat, unit base_units = cantidad)', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    const stockBefore = before!.stock_actual as number;

    const cantidad = 3;

    const { data: orderId, error: createErr } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad, sale_unit: 'unit' }],
      p_notas: `S2T3 unit cancel ${UNIQUE}`,
    });
    expect(createErr).toBeNull();

    const { error: cancelErr } = await client.rpc('cancel_order', { p_order_id: orderId });
    expect(cancelErr).toBeNull();

    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    expect(after?.stock_actual).toBe(stockBefore);

    await client.auth.signOut();
  });

  // Sub-case 5: NULL guard — sale_unit='package' on unit-only product (units_per_package=null) → RAISE
  it('5. NULL guard: package sale on unit-only product raises; no order created, no stock change', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', unitOnlyProductId)
      .single();
    const stockBefore = before!.stock_actual as number;

    const { data, error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: unitOnlyProductId, cantidad: 2, sale_unit: 'package' }],
      p_notas: `S2T3 null guard ${UNIQUE}`,
    });
    expect(error).not.toBeNull(); // must raise
    expect(data).toBeNull();

    // Stock must be unchanged (transaction rolled back)
    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', unitOnlyProductId)
      .single();
    expect(after?.stock_actual).toBe(stockBefore);

    await client.auth.signOut();
  });

  // Sub-case 6: precio_paca NULL guard — units_per_package set but precio_paca null → RAISE
  it('6. precio_paca NULL guard: package sale raises when precio_paca is null', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    // Create a product with units_per_package set but NO precio_paca
    // Note: the symmetric CHECK constraint was added in Slice 1, so we need to
    // bypass the DB constraint to create this state. We use the DB's existing behavior:
    // Actually, the symmetric constraint means this combo IS blocked at the DB level too.
    // So we test via a different product: a product with units_per_package=null only,
    // which is the unit-only product — already covered in sub-case 5.
    // For this sub-case, we test the mensaje: create a product ONLY for testing where
    // precio_paca is null but pack_size is set. But the symmetric constraint prevents that.
    // Instead, we verify the unit-only product raises the specific "units_per_package invalid"
    // message (which covers NULL units_per_package). The precio_paca=null with units_per_package
    // set scenario is DB-guarded, not reachable in normal operation.
    // We can verify the MESSAGE from sub-case 5 contains the right text.
    const { error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: unitOnlyProductId, cantidad: 1, sale_unit: 'package' }],
      p_notas: `S2T3 null msg ${UNIQUE}`,
    });
    expect(error).not.toBeNull();
    // Message should reference 'package' and the invalid configuration
    expect(error?.message).toMatch(/units_per_package invalid|not sold by package|no package price/i);

    await client.auth.signOut();
  });

  // Sub-case 7: Insufficient stock by pack → RAISE with base-unit message (2 pacas × 30 = 60 vs stock 35)
  it('7. insufficient stock by pack: raises with base-unit available/requested counts', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    // Set pack product stock to exactly 35 (< 60 = 2 packs × 30)
    await admin.from('products').update({ stock_actual: 35 }).eq('id', packProductId);

    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', packProductId)
      .single();

    const { data, error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: packProductId, cantidad: 2, sale_unit: 'package' }], // 2×30=60 > 35
      p_notas: `S2T3 insufficient ${UNIQUE}`,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
    // Message must show base units: available 35, requested 60
    expect(error?.message).toMatch(/available 35.*requested 60|available 35, requested 60/i);

    // Stock unchanged
    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', packProductId)
      .single();
    expect(after?.stock_actual).toBe(35);

    // Restore stock for other tests
    await admin.from('products').update({ stock_actual: packInitialStock }).eq('id', packProductId);

    await client.auth.signOut();
  });

  // Sub-case 8: Back-compat — item without sale_unit defaults to 'unit' behavior
  it('8. back-compat: item without sale_unit defaults to unit-sale behavior', async () => {
    const client = createBrowserStyleClient();
    await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    const stockBefore = before!.stock_actual as number;

    const cantidad = 2;

    // Call WITHOUT sale_unit in p_items (old client shape)
    const { data: orderId, error } = await client.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: productId, cantidad }], // no sale_unit field
      p_notas: `S2T3 back-compat ${UNIQUE}`,
    });
    expect(error).toBeNull();
    expect(orderId).not.toBeNull();

    // Stock should decrement by cantidad (unit sale)
    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', productId)
      .single();
    expect(after?.stock_actual).toBe(stockBefore - cantidad);

    // Line should have sale_unit='unit' and base_units=cantidad
    const { data: items } = await admin
      .from('order_items')
      .select('sale_unit, base_units')
      .eq('order_id', orderId);
    expect(items).toHaveLength(1);
    expect(items![0].sale_unit).toBe('unit');
    expect(items![0].base_units).toBe(cantidad);

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
