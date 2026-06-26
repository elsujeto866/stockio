// @vitest-environment node
/**
 * Dashboard Integration Tests
 *
 * Covers:
 *  (1) Low-stock count matches DB: products where stock_actual < stock_minimo
 *  (2) sumOrderTotals excludes cancelado orders
 *  (3) Date-range boundary: orders outside range are absent from periodOrders
 *  (4) getOrders limit caps returned rows to N
 *  (5) Tenant B cannot see tenant A data (RLS no-regression)
 *
 * Uses real DB via admin + browser-style clients.
 * UNIQUE suffix prevents fixture collision across parallel runs.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getProducts } from '@/lib/data/products';
import { getOrders } from '@/lib/data/orders';
import {
  filterLowStock,
  sumOrderTotals,
  countLowStock,
} from '@/lib/domain/dashboard';

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
// Unique suffix
// ---------------------------------------------------------------------------
const UNIQUE = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------
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
let storeAId: string;

// Products
let lowStockProductId = '';  // stock_actual < stock_minimo
let okStockProductId = '';   // stock_actual >= stock_minimo
let equalStockProductId = ''; // stock_actual === stock_minimo (NOT low stock)

// Orders
let pendienteOrderId = '';
let entregadoOrderId = '';
let canceladoOrderId = '';
let earlyOrderId = '';  // before current period

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userAEmail = `dash-int-a+${UNIQUE}@stockio.test`;
  userBEmail = `dash-int-b+${UNIQUE}@stockio.test`;

  // --- Tenant A ---
  const { data: tA, error: tAErr } = await admin
    .from('tenants')
    .insert({ nombre: `__dash_int_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (tAErr) throw new Error(`tenant A: ${tAErr.message}`);
  tenantAId = tA.id;

  // --- Tenant B ---
  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__dash_int_b_${UNIQUE}__` })
    .select('id')
    .single();
  if (tBErr) throw new Error(`tenant B: ${tBErr.message}`);
  tenantBId = tB.id;

  // --- Auth user A ---
  const { data: uA, error: uAErr } = await admin.auth.admin.createUser({
    email: userAEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uAErr) throw new Error(`user A: ${uAErr.message}`);
  userAId = uA.user.id;

  // --- Auth user B ---
  const { data: uB, error: uBErr } = await admin.auth.admin.createUser({
    email: userBEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uBErr) throw new Error(`user B: ${uBErr.message}`);
  userBId = uB.user.id;

  // --- Profiles ---
  await admin.from('profiles').insert({
    id: userAId, tenant_id: tenantAId, nombre: 'Dash Int A', rol: 'admin',
  });
  await admin.from('profiles').insert({
    id: userBId, tenant_id: tenantBId, nombre: 'Dash Int B', rol: 'admin',
  });

  // --- Store A ---
  const { data: sA, error: sAErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantAId, nombre: `__dash_store_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (sAErr) throw new Error(`store A: ${sAErr.message}`);
  storeAId = sA.id;

  // --- Products ---
  // Low stock: stock_actual (1) < stock_minimo (10)
  const { data: pLow, error: pLowErr } = await admin
    .from('products')
    .insert({ tenant_id: tenantAId, nombre: `__dash_low_${UNIQUE}__`, precio_unitario: 5, stock_actual: 1, stock_minimo: 10, activo: true })
    .select('id')
    .single();
  if (pLowErr) throw new Error(`product low: ${pLowErr.message}`);
  lowStockProductId = pLow.id;

  // OK stock: stock_actual (20) > stock_minimo (10)
  const { data: pOk, error: pOkErr } = await admin
    .from('products')
    .insert({ tenant_id: tenantAId, nombre: `__dash_ok_${UNIQUE}__`, precio_unitario: 5, stock_actual: 20, stock_minimo: 10, activo: true })
    .select('id')
    .single();
  if (pOkErr) throw new Error(`product ok: ${pOkErr.message}`);
  okStockProductId = pOk.id;

  // Equal stock: stock_actual (10) === stock_minimo (10) → NOT low stock
  const { data: pEq, error: pEqErr } = await admin
    .from('products')
    .insert({ tenant_id: tenantAId, nombre: `__dash_eq_${UNIQUE}__`, precio_unitario: 5, stock_actual: 10, stock_minimo: 10, activo: true })
    .select('id')
    .single();
  if (pEqErr) throw new Error(`product equal: ${pEqErr.message}`);
  equalStockProductId = pEq.id;

  // --- Orders ---
  // Today's date for period boundary
  const today = new Date().toISOString().slice(0, 10);
  // An early date outside current month
  const earlyDate = '2020-01-15';

  const { data: oP, error: oPErr } = await admin
    .from('orders')
    .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'pendiente', fecha: today, total: 100 })
    .select('id')
    .single();
  if (oPErr) throw new Error(`pendiente order: ${oPErr.message}`);
  pendienteOrderId = oP.id;

  const { data: oE, error: oEErr } = await admin
    .from('orders')
    .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'entregado', fecha: today, total: 200 })
    .select('id')
    .single();
  if (oEErr) throw new Error(`entregado order: ${oEErr.message}`);
  entregadoOrderId = oE.id;

  const { data: oC, error: oCErr } = await admin
    .from('orders')
    .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'cancelado', fecha: today, total: 999 })
    .select('id')
    .single();
  if (oCErr) throw new Error(`cancelado order: ${oCErr.message}`);
  canceladoOrderId = oC.id;

  // Early order — outside current month
  const { data: oEarly, error: oEarlyErr } = await admin
    .from('orders')
    .insert({ tenant_id: tenantAId, store_id: storeAId, estado: 'pendiente', fecha: earlyDate, total: 50 })
    .select('id')
    .single();
  if (oEarlyErr) throw new Error(`early order: ${oEarlyErr.message}`);
  earlyOrderId = oEarly.id;

  // --- Sign in ---
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
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('(1) Low-stock count matches DB', () => {
  it('filterLowStock returns only products where stock_actual < stock_minimo', async () => {
    const allProducts = await getProducts(clientA);
    const myProducts = allProducts.filter((p) =>
      [lowStockProductId, okStockProductId, equalStockProductId].includes(p.id)
    );
    const lowStock = filterLowStock(myProducts);
    const ids = lowStock.map((p) => p.id);
    expect(ids).toContain(lowStockProductId);
    expect(ids).not.toContain(okStockProductId);
    expect(ids).not.toContain(equalStockProductId);
  });

  it('countLowStock returns the correct count', async () => {
    const allProducts = await getProducts(clientA);
    const myProducts = allProducts.filter((p) =>
      [lowStockProductId, okStockProductId, equalStockProductId].includes(p.id)
    );
    expect(countLowStock(myProducts)).toBe(1);
  });
});

describe('(2) sumOrderTotals excludes cancelado', () => {
  it('sums pendiente + entregado totals and excludes cancelado', async () => {
    const allOrders = await getOrders(clientA);
    const myOrders = allOrders.filter((o) =>
      [pendienteOrderId, entregadoOrderId, canceladoOrderId].includes(o.id)
    );
    const total = sumOrderTotals(myOrders);
    // 100 (pendiente) + 200 (entregado) = 300; cancelado (999) excluded
    expect(total).toBe(300);
  });
});

describe('(3) Date-range boundary — orders outside period are absent', () => {
  it('earlyOrderId is absent from current-month date range', async () => {
    const today = new Date();
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const monthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    const periodOrders = await getOrders(clientA, { from: monthStart, to: todayStr });
    const returnedIds = periodOrders.map((o) => o.id);
    expect(returnedIds).not.toContain(earlyOrderId);
  });

  it('current-day orders appear in the period range', async () => {
    const today = new Date();
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const monthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    const periodOrders = await getOrders(clientA, { from: monthStart, to: todayStr });
    const returnedIds = periodOrders.map((o) => o.id);
    expect(returnedIds).toContain(pendienteOrderId);
  });
});

describe('(4) getOrders limit caps rows', () => {
  it('returns at most limit rows when limit is provided', async () => {
    const limited = await getOrders(clientA, { limit: 2 });
    // We have at least 4 orders for tenant A; limit should cap at 2
    expect(limited.length).toBeLessThanOrEqual(2);
  });
});

describe('(5) RLS no-regression — tenant B cannot see tenant A data', () => {
  it('tenant B sees 0 products from tenant A', async () => {
    const bProducts = await getProducts(clientB);
    const idsFromA = [lowStockProductId, okStockProductId, equalStockProductId];
    const overlap = bProducts.filter((p) => idsFromA.includes(p.id));
    expect(overlap).toHaveLength(0);
  });

  it('tenant B sees 0 orders from tenant A', async () => {
    const bOrders = await getOrders(clientB);
    const idsFromA = [pendienteOrderId, entregadoOrderId, canceladoOrderId, earlyOrderId];
    const overlap = bOrders.filter((o) => idsFromA.includes(o.id));
    expect(overlap).toHaveLength(0);
  });
});
