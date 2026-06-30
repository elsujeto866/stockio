// @vitest-environment node
/**
 * WU-A Integration Tests — Invoice RPC + Data Seam
 *
 * Covers:
 *   - Per-tenant gapless numbering (order1 → 1, order2 → 2)
 *   - Independent tenant counters (tenant B starts at 1 regardless of tenant A)
 *   - Gapless-under-rollback: duplicate attempt does NOT advance the counter;
 *     next success gets the next number with no gap
 *   - One-invoice-per-order: second create_invoice for same order is rejected
 *   - Cancelled order rejected: RAISE + no row + counter unchanged
 *   - Total copied from order: invoice.total == order.total
 *   - Cross-tenant getInvoice returns null (RLS isolation)
 *
 * STRICT TDD — RED PHASE:
 *   The migration 20260626150000_create_invoice_rpc.sql has NOT been applied yet.
 *   All create_invoice RPC calls will fail with "function create_invoice(uuid) does
 *   not exist" (or similar). Tests expecting error === null WILL FAIL → correct RED.
 *   All other assertions (cleanup, setup) should work with the current DB state.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getInvoice, getInvoiceByOrderId } from '@/lib/data/invoices';

// ---------------------------------------------------------------------------
// WebSocket stub — prevents real-time WS connections in test environment
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
// Unique suffix — prevents fixture collision across parallel test runs
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
let storeBId: string;

// WU4 fiscal fixture stores
let storeSriId: string;     // tipo='05', numero='1713175071', razon='Juan Pérez' — full snapshot test
let storeFallbackId: string; // tipo='05', numero='1713175071', razon=NULL — razon fallback test

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  userAEmail = `inv-a+${UNIQUE}@stockio.test`;
  userBEmail = `inv-b+${UNIQUE}@stockio.test`;

  // Tenant A
  const { data: tA, error: tAErr } = await admin
    .from('tenants')
    .insert({ nombre: `__inv_tenant_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (tAErr) throw new Error(`tenant A: ${tAErr.message}`);
  tenantAId = tA.id;

  // Tenant B
  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__inv_tenant_b_${UNIQUE}__` })
    .select('id')
    .single();
  if (tBErr) throw new Error(`tenant B: ${tBErr.message}`);
  tenantBId = tB.id;

  // WU4: set RUC on both tenants so existing gapless tests survive the new NULL-RUC guard
  const { error: rucAErr } = await admin
    .from('tenants')
    .update({ ruc: '0992234789001' })
    .eq('id', tenantAId);
  if (rucAErr) throw new Error(`tenant A ruc: ${rucAErr.message}`);

  const { error: rucBErr } = await admin
    .from('tenants')
    .update({ ruc: '0992234789002' })
    .eq('id', tenantBId);
  if (rucBErr) throw new Error(`tenant B ruc: ${rucBErr.message}`);

  // Auth user A
  const { data: uA, error: uAErr } = await admin.auth.admin.createUser({
    email: userAEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uAErr) throw new Error(`user A: ${uAErr.message}`);
  userAId = uA.user.id;

  // Auth user B
  const { data: uB, error: uBErr } = await admin.auth.admin.createUser({
    email: userBEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uBErr) throw new Error(`user B: ${uBErr.message}`);
  userBId = uB.user.id;

  // Profile A
  const { error: pAErr } = await admin
    .from('profiles')
    .insert({ id: userAId, tenant_id: tenantAId, nombre: 'Invoice Test A', rol: 'admin' });
  if (pAErr) throw new Error(`profile A: ${pAErr.message}`);

  // Profile B
  const { error: pBErr } = await admin
    .from('profiles')
    .insert({ id: userBId, tenant_id: tenantBId, nombre: 'Invoice Test B', rol: 'admin' });
  if (pBErr) throw new Error(`profile B: ${pBErr.message}`);

  // Store A
  const { data: sA, error: sAErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantAId, nombre: `__inv_store_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (sAErr) throw new Error(`store A: ${sAErr.message}`);
  storeAId = sA.id;

  // Store B
  const { data: sB, error: sBErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantBId, nombre: `__inv_store_b_${UNIQUE}__` })
    .select('id')
    .single();
  if (sBErr) throw new Error(`store B: ${sBErr.message}`);
  storeBId = sB.id;

  // WU4 — store with explicit cédula buyer (Scenario 6.1)
  const { data: sSri, error: sSriErr } = await admin
    .from('stores')
    .insert({
      tenant_id: tenantAId,
      nombre: `__sri_buyer_${UNIQUE}__`,
      tipo_identificacion: '05',
      numero_identificacion: '1713175071',
      razon_social_comprobante: 'Juan Pérez',
    })
    .select('id')
    .single();
  if (sSriErr) throw new Error(`store sri: ${sSriErr.message}`);
  storeSriId = sSri.id;

  // WU4 — store with cédula buyer but NULL razon (Scenario 6.3 fallback)
  const { data: sFb, error: sFbErr } = await admin
    .from('stores')
    .insert({
      tenant_id: tenantAId,
      nombre: 'Tienda ABC',
      tipo_identificacion: '05',
      numero_identificacion: '1713175071',
      razon_social_comprobante: null,
    })
    .select('id')
    .single();
  if (sFbErr) throw new Error(`store fallback: ${sFbErr.message}`);
  storeFallbackId = sFb.id;

  // Authenticate client A
  clientA = createBrowserStyleClient();
  const { error: signInAErr } = await clientA.auth.signInWithPassword({
    email: userAEmail,
    password: PASSWORD,
  });
  if (signInAErr) throw new Error(`sign-in A: ${signInAErr.message}`);

  // Authenticate client B
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
  // CASCADE deletes stores, orders, order_items, invoices, tenant_invoice_counters
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// Helper: insert a pendiente order for a tenant via admin
// ---------------------------------------------------------------------------
async function insertOrder(
  tenantId: string,
  storeId: string,
  opts: { total?: number; estado?: string } = {}
): Promise<string> {
  const { data, error } = await admin
    .from('orders')
    .insert({
      tenant_id: tenantId,
      store_id: storeId,
      estado: opts.estado ?? 'pendiente',
      ...(opts.total !== undefined ? { total: opts.total } : {}),
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertOrder: ${error.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Per-tenant gapless numbering
//
// RED until migration is applied: create_invoice RPC does not exist.
// ---------------------------------------------------------------------------
describe('per-tenant gapless numbering', () => {
  it('tenant A: first two invoices get numero 1 and 2', async () => {
    const order1Id = await insertOrder(tenantAId, storeAId, { total: 100.00 });
    const order2Id = await insertOrder(tenantAId, storeAId, { total: 200.00 });

    // First invoice
    const { data: invoiceId1, error: e1 } = await clientA.rpc('create_invoice', {
      p_order_id: order1Id,
    });
    // RED: error expected here until migration applied
    expect(e1).toBeNull();
    expect(invoiceId1).not.toBeNull();

    // Second invoice
    const { data: invoiceId2, error: e2 } = await clientA.rpc('create_invoice', {
      p_order_id: order2Id,
    });
    expect(e2).toBeNull();
    expect(invoiceId2).not.toBeNull();

    // Verify sequential numbering
    const { data: inv1 } = await admin
      .from('invoices')
      .select('numero')
      .eq('id', invoiceId1)
      .single();
    const { data: inv2 } = await admin
      .from('invoices')
      .select('numero')
      .eq('id', invoiceId2)
      .single();

    expect(inv1?.numero).toBe(1);
    expect(inv2?.numero).toBe(2);
  });

  it('tenant B: starts counter independently at 1 regardless of tenant A', async () => {
    const orderBId = await insertOrder(tenantBId, storeBId, { total: 50.00 });

    const { data: invoiceIdB, error: eB } = await clientB.rpc('create_invoice', {
      p_order_id: orderBId,
    });
    // RED: error expected here until migration applied
    expect(eB).toBeNull();
    expect(invoiceIdB).not.toBeNull();

    const { data: invB } = await admin
      .from('invoices')
      .select('numero')
      .eq('id', invoiceIdB)
      .single();

    // Tenant B counter is independent — starts at 1
    expect(invB?.numero).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gapless-under-rollback
//
// Verifies that a failed duplicate create_invoice does NOT advance the counter.
// The pre-check RAISE fires before next_invoice_number() is called, so the
// counter stays at its last successful value.
// RED until migration is applied.
// ---------------------------------------------------------------------------
describe('gapless-under-rollback', () => {
  it('counter does not advance after a failed duplicate; next order gets the correct next number', async () => {
    const orderXId = await insertOrder(tenantAId, storeAId, { total: 75.00 });
    const orderYId = await insertOrder(tenantAId, storeAId, { total: 80.00 });

    // Read counter before any invoice creation for these orders
    const { data: counterBefore } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', tenantAId)
      .single();
    const numBefore = counterBefore?.last_number ?? 0;

    // Create invoice for orderX — succeeds, counter becomes numBefore + 1
    const { data: invoiceXId, error: eX } = await clientA.rpc('create_invoice', {
      p_order_id: orderXId,
    });
    // RED: error expected until migration applied
    expect(eX).toBeNull();
    expect(invoiceXId).not.toBeNull();

    // Verify numero = numBefore + 1
    const { data: invX } = await admin
      .from('invoices')
      .select('numero')
      .eq('id', invoiceXId)
      .single();
    expect(invX?.numero).toBe(numBefore + 1);

    // Attempt duplicate invoice for orderX — must RAISE
    const { data: dupeData, error: dupeErr } = await clientA.rpc('create_invoice', {
      p_order_id: orderXId,
    });
    expect(dupeErr).not.toBeNull();
    expect(dupeData).toBeNull();
    // The error message must contain the duplicate guard text
    expect(dupeErr?.message).toMatch(/Invoice already exists for order/i);

    // Counter must still be numBefore + 1, NOT numBefore + 2
    const { data: counterAfterDupe } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', tenantAId)
      .single();
    expect(counterAfterDupe?.last_number).toBe(numBefore + 1);

    // Create invoice for orderY — must get numBefore + 2 (no gap)
    const { data: invoiceYId, error: eY } = await clientA.rpc('create_invoice', {
      p_order_id: orderYId,
    });
    expect(eY).toBeNull();
    expect(invoiceYId).not.toBeNull();

    const { data: invY } = await admin
      .from('invoices')
      .select('numero')
      .eq('id', invoiceYId)
      .single();
    expect(invY?.numero).toBe(numBefore + 2);
  });
});

// ---------------------------------------------------------------------------
// One-invoice-per-order rejected
//
// RED until migration is applied.
// ---------------------------------------------------------------------------
describe('one-invoice-per-order', () => {
  it('second create_invoice for the same order raises with a clear message; no row inserted; counter unchanged', async () => {
    const orderId = await insertOrder(tenantAId, storeAId, { total: 120.00 });

    // First invoice — should succeed
    const { data: invoiceId, error: e1 } = await clientA.rpc('create_invoice', {
      p_order_id: orderId,
    });
    // RED: error expected until migration applied
    expect(e1).toBeNull();
    expect(invoiceId).not.toBeNull();

    // Read counter after first invoice
    const { data: counterAfterFirst } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', tenantAId)
      .single();
    const counterVal = counterAfterFirst?.last_number;

    // Second invoice — must fail
    const { error: e2 } = await clientA.rpc('create_invoice', { p_order_id: orderId });
    expect(e2).not.toBeNull();
    expect(e2?.message).toMatch(/Invoice already exists for order/i);

    // Exactly one invoice row for this order
    const { data: rows } = await admin
      .from('invoices')
      .select('id')
      .eq('order_id', orderId);
    expect(rows).toHaveLength(1);

    // Counter unchanged after failed attempt
    const { data: counterAfterDupe } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', tenantAId)
      .single();
    expect(counterAfterDupe?.last_number).toBe(counterVal);
  });
});

// ---------------------------------------------------------------------------
// Cancelled order rejected
//
// RED until migration is applied.
// ---------------------------------------------------------------------------
describe('cancelled order rejected', () => {
  it('create_invoice on a cancelled order raises; no invoice row; counter unchanged', async () => {
    const orderId = await insertOrder(tenantAId, storeAId, {
      total: 90.00,
      estado: 'cancelado',
    });

    // Read counter before attempt
    const { data: counterBefore } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', tenantAId)
      .single();
    const counterVal = counterBefore?.last_number ?? 0;

    // Must fail
    const { data: invoiceId, error } = await clientA.rpc('create_invoice', {
      p_order_id: orderId,
    });
    // RED: error expected until migration applied
    expect(error).not.toBeNull();
    expect(invoiceId).toBeNull();
    expect(error?.message).toMatch(/Cancelled orders cannot be invoiced/i);

    // No invoice row created
    const { data: rows } = await admin
      .from('invoices')
      .select('id')
      .eq('order_id', orderId);
    expect(rows).toHaveLength(0);

    // Counter unchanged
    const { data: counterAfter } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', tenantAId)
      .single();
    expect(counterAfter?.last_number ?? 0).toBe(counterVal);
  });
});

// ---------------------------------------------------------------------------
// Total copied from order
//
// RED until migration is applied.
// ---------------------------------------------------------------------------
describe('total copied from order', () => {
  it('invoice.total equals order.total when order.total is not null', async () => {
    const ORDER_TOTAL = 350.00;
    const orderId = await insertOrder(tenantAId, storeAId, { total: ORDER_TOTAL });

    const { data: invoiceId, error } = await clientA.rpc('create_invoice', {
      p_order_id: orderId,
    });
    // RED: error expected until migration applied
    expect(error).toBeNull();
    expect(invoiceId).not.toBeNull();

    const { data: invoice } = await admin
      .from('invoices')
      .select('total')
      .eq('id', invoiceId)
      .single();

    expect(Number(invoice?.total)).toBeCloseTo(ORDER_TOTAL, 2);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant getInvoice returns null (RLS isolation)
//
// Uses the getInvoice data seam — verifies that an authenticated client from
// tenant B cannot read an invoice belonging to tenant A.
// RED until migration is applied (need a real invoice to test with).
// ---------------------------------------------------------------------------
describe('cross-tenant RLS isolation', () => {
  it('getInvoice returns null when accessed by a different tenant client', async () => {
    const orderId = await insertOrder(tenantAId, storeAId, { total: 60.00 });

    // Create invoice as tenant A
    const { data: invoiceId, error } = await clientA.rpc('create_invoice', {
      p_order_id: orderId,
    });
    // RED: error expected until migration applied
    expect(error).toBeNull();
    expect(invoiceId).not.toBeNull();

    // Tenant B tries to access tenant A's invoice — must return null (RLS blocks)
    const result = await getInvoice(clientB, invoiceId as string);
    expect(result).toBeNull();
  });

  it('getInvoiceByOrderId returns null when accessed by a different tenant client', async () => {
    const orderId = await insertOrder(tenantAId, storeAId, { total: 45.00 });

    // Create invoice as tenant A
    const { error } = await clientA.rpc('create_invoice', { p_order_id: orderId });
    // RED: error expected until migration applied
    expect(error).toBeNull();

    // Tenant B tries to find the invoice by orderId — must return null (RLS blocks)
    const result = await getInvoiceByOrderId(clientB, orderId);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WU4 — SRI fiscal snapshot (REQ-4a, REQ-5, REQ-6)
//
// RED until migration 20260630120300_create_invoice_sri.sql is applied:
//   - NULL-RUC test expects RAISE but old RPC succeeds → fails
//   - Snapshot column tests: old RPC sets them NULL → assertion fails
//   - IVA tests: old RPC does not compute → subtotal_base_imponible=NULL → fails
// ---------------------------------------------------------------------------
describe('SRI fiscal snapshot — WU4 (create_invoice RPC rewrite)', () => {
  // ── Scenario 4.1 — NULL RUC blocks emit ──────────────────────────────────
  it('tenant with null RUC: RAISE exception, no invoice row, counter unchanged (Scenario 4.1)', async () => {
    const nullEmail = `null-ruc+${UNIQUE}@stockio.test`;

    // Create an isolated tenant WITHOUT ruc
    const { data: nullTenant } = await admin
      .from('tenants')
      .insert({ nombre: `__null_ruc_${UNIQUE}__` })
      .select('id')
      .single();
    const nullTenantId = nullTenant!.id;

    const { data: nullUser } = await admin.auth.admin.createUser({
      email: nullEmail, password: PASSWORD, email_confirm: true,
    });
    const nullUserId = nullUser.user.id;

    await admin.from('profiles').insert({
      id: nullUserId, tenant_id: nullTenantId, nombre: 'NullRuc', rol: 'admin',
    });

    const { data: nullStore } = await admin
      .from('stores')
      .insert({ tenant_id: nullTenantId, nombre: 'NullRucStore' })
      .select('id')
      .single();

    const nullClient = createBrowserStyleClient();
    await nullClient.auth.signInWithPassword({ email: nullEmail, password: PASSWORD });

    // Counter before
    const { data: ctrBefore } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', nullTenantId)
      .maybeSingle();
    const numBefore = ctrBefore?.last_number ?? 0;

    const orderId = await insertOrder(nullTenantId, nullStore!.id, { total: 100.00 });

    // RED: old RPC has no NULL-RUC check → succeeds; after WU4 migration → RAISE
    const { data: invoiceId, error } = await nullClient.rpc('create_invoice', { p_order_id: orderId });
    expect(error).not.toBeNull();
    expect(invoiceId).toBeNull();
    expect(error?.message).toMatch(/ruc/i);

    // No invoice row created
    const { data: rows } = await admin.from('invoices').select('id').eq('order_id', orderId);
    expect(rows).toHaveLength(0);

    // Counter must not advance
    const { data: ctrAfter } = await admin
      .from('tenant_invoice_counters')
      .select('last_number')
      .eq('tenant_id', nullTenantId)
      .maybeSingle();
    expect(ctrAfter?.last_number ?? 0).toBe(numBefore);

    // Cleanup
    await nullClient.auth.signOut();
    await admin.auth.admin.deleteUser(nullUserId);
    await admin.from('tenants').delete().eq('id', nullTenantId);
  }, 30_000);

  // ── Scenario 6.1 — Full snapshot ─────────────────────────────────────────
  it('full fiscal snapshot: all 9 cols populated from tenant + store (Scenario 6.1)', async () => {
    const orderId = await insertOrder(tenantAId, storeSriId, { total: 115.00 });

    // RED: old RPC → fiscal cols are NULL
    const { data: invoiceId, error } = await clientA.rpc('create_invoice', { p_order_id: orderId });
    expect(error).toBeNull();
    expect(invoiceId).not.toBeNull();

    const { data: inv } = await admin
      .from('invoices')
      .select(
        'emisor_ruc, emisor_razon_social, emisor_estab, emisor_pto_emi, ' +
        'comprador_tipo_identificacion, comprador_numero_identificacion, comprador_razon_social, ' +
        'subtotal_base_imponible, valor_iva'
      )
      .eq('id', invoiceId)
      .single();

    expect(inv?.emisor_ruc).toBe('0992234789001');
    expect(inv?.emisor_razon_social).not.toBeNull();
    expect(inv?.emisor_estab).toBe('001');
    expect(inv?.emisor_pto_emi).toBe('001');
    expect(inv?.comprador_tipo_identificacion).toBe('05');
    expect(inv?.comprador_numero_identificacion).toBe('1713175071');
    expect(inv?.comprador_razon_social).toBe('Juan Pérez');
  });

  // ── Scenario 6.2 — Consumidor Final snapshot ─────────────────────────────
  it('consumidor final: storeA has tipo=07 + NULL numero → comprador_* defaults (Scenario 6.2)', async () => {
    // storeA: tipo='07', numero_identificacion=NULL (WU3 migration default) → falls back to consumidor final
    const orderId = await insertOrder(tenantAId, storeAId, { total: 50.00 });

    // RED: old RPC → comprador_* are NULL
    const { data: invoiceId, error } = await clientA.rpc('create_invoice', { p_order_id: orderId });
    expect(error).toBeNull();
    expect(invoiceId).not.toBeNull();

    const { data: inv } = await admin
      .from('invoices')
      .select('comprador_tipo_identificacion, comprador_numero_identificacion, comprador_razon_social')
      .eq('id', invoiceId)
      .single();

    expect(inv?.comprador_tipo_identificacion).toBe('07');
    expect(inv?.comprador_numero_identificacion).toBe('9999999999999');
    expect(inv?.comprador_razon_social).toBe('CONSUMIDOR FINAL');
  });

  // ── Scenario 6.3 — razon_social fallback ─────────────────────────────────
  it('comprador_razon_social falls back to store.nombre when razon_social_comprobante is NULL (Scenario 6.3)', async () => {
    const orderId = await insertOrder(tenantAId, storeFallbackId, { total: 30.00 });

    // RED: old RPC → comprador_razon_social NULL
    const { data: invoiceId, error } = await clientA.rpc('create_invoice', { p_order_id: orderId });
    expect(error).toBeNull();
    expect(invoiceId).not.toBeNull();

    const { data: inv } = await admin
      .from('invoices')
      .select('comprador_razon_social')
      .eq('id', invoiceId)
      .single();

    expect(inv?.comprador_razon_social).toBe('Tienda ABC');
  });

  // ── Scenario 5.1 — IVA round total ───────────────────────────────────────
  it('total=115.00 → subtotal_base_imponible=100.00, valor_iva=15.00 (Scenario 5.1)', async () => {
    const orderId = await insertOrder(tenantAId, storeAId, { total: 115.00 });

    // RED: old RPC → subtotal_base_imponible=NULL
    const { data: invoiceId, error } = await clientA.rpc('create_invoice', { p_order_id: orderId });
    expect(error).toBeNull();
    expect(invoiceId).not.toBeNull();

    const { data: inv } = await admin
      .from('invoices')
      .select('subtotal_base_imponible, valor_iva, total')
      .eq('id', invoiceId)
      .single();

    expect(Number(inv?.subtotal_base_imponible)).toBeCloseTo(100.00, 2);
    expect(Number(inv?.valor_iva)).toBeCloseTo(15.00, 2);
    expect(Number(inv?.subtotal_base_imponible) + Number(inv?.valor_iva)).toBeCloseTo(Number(inv?.total), 2);
  });

  // ── Scenario 5.2 — IVA non-round total ───────────────────────────────────
  it('total=23.00 → subtotal_base_imponible=20.00, valor_iva=3.00 (Scenario 5.2)', async () => {
    const orderId = await insertOrder(tenantAId, storeAId, { total: 23.00 });

    // RED: old RPC → subtotal_base_imponible=NULL
    const { data: invoiceId, error } = await clientA.rpc('create_invoice', { p_order_id: orderId });
    expect(error).toBeNull();
    expect(invoiceId).not.toBeNull();

    const { data: inv } = await admin
      .from('invoices')
      .select('subtotal_base_imponible, valor_iva')
      .eq('id', invoiceId)
      .single();

    expect(Number(inv?.subtotal_base_imponible)).toBeCloseTo(20.00, 2);
    expect(Number(inv?.valor_iva)).toBeCloseTo(3.00, 2);
  });
});
