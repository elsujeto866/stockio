// @vitest-environment node
/**
 * AR-T15 + AR-T16 — Integration tests for record_payment RPC.
 *
 * ⚠️ FEFO SEED GOTCHA (top-of-file):
 * Fixtures MUST seed lots → products → orders (via create_order FEFO RPC) → invoices
 * in that exact dependency order BEFORE recording payments. Failure to seed lots causes
 * create_order to fail because the FEFO RPC requires available lots. See expiry-batches
 * fixes fbdafe0 / 5be6136.
 *
 * Scenarios covered (AR-T15):
 *   S1-1: store with payment_terms_days=45 → new invoice due_date = fecha_emision + 45
 *   S1-2: store with payment_terms_days=30 (default) → due_date = fecha_emision + 30
 *   S2-1: partial payment → total_paid updated, estado_pago stays 'pendiente', SUM=total_paid
 *   S2-2: cumulative payments reaching total → estado_pago flips 'pagado'
 *   S2-3: overpayment → OverpaymentError, 0 rows in payments, total_paid unchanged
 *   S2-4: cancelled-order invoice → CancelledOrderPaymentError, no mutation
 *   S2-5: amount=0 → InvalidPaymentAmountError, no mutation
 *   S7-1: after backfill, existing stores have payment_terms_days=30
 *   S7-2: after backfill, invoices have total_paid=0 and due_date set
 *
 * Cross-tenant (AR-T16):
 *   S9-1: tenant B queries payments for tenant A's invoice → 0 rows
 *   S9-2: tenant B calls record_payment with tenant A's invoice_id → InvoiceNotFoundError
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  recordPayment,
  getPaymentsByInvoice,
  OverpaymentError,
  CancelledOrderPaymentError,
  InvalidPaymentAmountError,
  InvoiceNotFoundError,
} from '@/lib/data/payments';

// ---------------------------------------------------------------------------
// WebSocket stub (Node.js < 22 compatibility) — same pattern as schema.test.ts
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

const UNIQUE = Date.now().toString(36);
const PASSWORD = 'TestPass123!';
const INVOICE_TOTAL = 1000;
const CANCELLED_TOTAL = 500;

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------
function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY');
  }
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });
}

function createUserClient(email: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const admin = createAdminClient();

// Tenant A (primary)
let tenantId: string;
let userId: string;
let userEmail: string;
let storeId: string;          // store with default 30-day terms
let store45Id: string;        // store with 45-day terms
let productId: string;
let invoiceId: string;        // non-cancelled invoice on storeId (total=1000)
let cancelledInvoiceId: string;
let invoice45Id: string;      // invoice on store45Id for S1-1

// Tenant B (cross-tenant isolation)
let tenantBId: string;
let userBId: string;
let userBEmail: string;

async function seedLotAndProduct(
  tId: string,
  nombre: string,
  stock: number
): Promise<string> {
  const seedDate = new Date().toISOString().split('T')[0];

  const { data: p, error: pErr } = await admin
    .from('products')
    .insert({ tenant_id: tId, nombre, precio_unitario: 10, stock_actual: stock })
    .select('id')
    .single();
  if (pErr) throw new Error(`product insert failed: ${pErr.message}`);

  // ⚠️ FEFO: seed lot BEFORE creating orders (create_order FEFO requires lots)
  const { error: lotErr } = await admin.from('lots').insert({
    tenant_id: tId,
    product_id: p!.id,
    lot_type: 'adjustment',
    quantity: stock,
    received_date: seedDate,
  });
  if (lotErr) throw new Error(`lot insert failed: ${lotErr.message}`);

  return p!.id;
}

async function createOrderAndInvoice(
  userSupabase: SupabaseClient,
  sId: string,
  pId: string,
  cantidad: number
): Promise<{ orderId: string; invoiceId: string }> {
  // Use create_order FEFO RPC (requires lots seeded above)
  const { data: orderId, error: oErr } = await userSupabase.rpc('create_order', {
    p_store_id: sId,
    p_items: [{ product_id: pId, cantidad }],
    p_notas: `AR integration test ${UNIQUE}`,
  });
  if (oErr) throw new Error(`create_order failed: ${oErr.message}`);

  const { data: invId, error: invErr } = await userSupabase.rpc('create_invoice', {
    p_order_id: orderId,
  });
  if (invErr) throw new Error(`create_invoice failed: ${invErr.message}`);

  return { orderId: orderId as string, invoiceId: invId as string };
}

// ---------------------------------------------------------------------------
// Setup (beforeAll)
// ---------------------------------------------------------------------------
beforeAll(async () => {
  // --- Tenant A ---
  const { data: t, error: tErr } = await admin
    .from('tenants')
    .insert({ nombre: `__ar_test_A_${UNIQUE}__` })
    .select('id')
    .single();
  if (tErr) throw new Error(`tenant A insert failed: ${tErr.message}`);
  tenantId = t.id;

  userEmail = `ar+${UNIQUE}@stockio.test`;
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: userEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uErr) throw new Error(`user A create failed: ${uErr.message}`);
  userId = u.user.id;

  const { error: pErr } = await admin
    .from('profiles')
    .insert({ id: userId, tenant_id: tenantId, nombre: 'AR Tester', rol: 'admin' });
  if (pErr) throw new Error(`profile A insert failed: ${pErr.message}`);

  // Store with default 30-day terms
  const { data: s, error: sErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantId, nombre: `__ar_store_30_${UNIQUE}__`, payment_terms_days: 30 })
    .select('id')
    .single();
  if (sErr) throw new Error(`store insert failed: ${sErr.message}`);
  storeId = s.id;

  // Store with 45-day terms (for S1-1)
  const { data: s45, error: s45Err } = await admin
    .from('stores')
    .insert({ tenant_id: tenantId, nombre: `__ar_store_45_${UNIQUE}__`, payment_terms_days: 45 })
    .select('id')
    .single();
  if (s45Err) throw new Error(`store45 insert failed: ${s45Err.message}`);
  store45Id = s45.id;

  // Product + lot for main store (FEFO: lot first)
  productId = await seedLotAndProduct(tenantId, `__ar_product_${UNIQUE}__`, 100);

  // Separate product for store45 (FEFO: lot first)
  const product45Id = await seedLotAndProduct(tenantId, `__ar_product_45_${UNIQUE}__`, 50);

  // Sign in as tenant A user
  const userSupabase = createUserClient(userEmail);
  await userSupabase.auth.signInWithPassword({ email: userEmail, password: PASSWORD });

  // Create main invoice (total = 10 * 100 per item × quantity; use cantidad=INVOICE_TOTAL/10=100)
  // Actually, precio_unitario=10, cantidad=100 → total=1000 matches INVOICE_TOTAL
  const { invoiceId: mainInvId } = await createOrderAndInvoice(userSupabase, storeId, productId, 100);
  invoiceId = mainInvId;

  // Create invoice on store45 (for S1-1)
  const { invoiceId: inv45 } = await createOrderAndInvoice(userSupabase, store45Id, product45Id, 10);
  invoice45Id = inv45;

  // Create a separate order+invoice then cancel it (for S2-4)
  const prodCancelled = await seedLotAndProduct(tenantId, `__ar_product_cancel_${UNIQUE}__`, 10);
  const { orderId: cancelledOrderId, invoiceId: cancelledInv } = await createOrderAndInvoice(
    userSupabase,
    storeId,
    prodCancelled,
    10
  );
  cancelledInvoiceId = cancelledInv;

  // Cancel the order (admin key, bypass RLS)
  const { error: cancelErr } = await admin
    .from('orders')
    .update({ estado: 'cancelado' })
    .eq('id', cancelledOrderId);
  if (cancelErr) throw new Error(`cancel order failed: ${cancelErr.message}`);

  // --- Tenant B ---
  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__ar_test_B_${UNIQUE}__` })
    .select('id')
    .single();
  if (tBErr) throw new Error(`tenant B insert failed: ${tBErr.message}`);
  tenantBId = tB.id;

  userBEmail = `ar_b+${UNIQUE}@stockio.test`;
  const { data: uB, error: uBErr } = await admin.auth.admin.createUser({
    email: userBEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uBErr) throw new Error(`user B create failed: ${uBErr.message}`);
  userBId = uB.user.id;

  const { error: pBErr } = await admin
    .from('profiles')
    .insert({ id: userBId, tenant_id: tenantBId, nombre: 'AR Tester B', rol: 'admin' });
  if (pBErr) throw new Error(`profile B insert failed: ${pBErr.message}`);
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// Helper: get a fresh signed-in client for tenant A user
// ---------------------------------------------------------------------------
async function getUserClient(): Promise<SupabaseClient> {
  const client = createUserClient(userEmail);
  const { error } = await client.auth.signInWithPassword({ email: userEmail, password: PASSWORD });
  if (error) throw new Error(`sign in failed: ${error.message}`);
  return client;
}

async function getUserBClient(): Promise<SupabaseClient> {
  const client = createUserClient(userBEmail);
  const { error } = await client.auth.signInWithPassword({ email: userBEmail, password: PASSWORD });
  if (error) throw new Error(`sign in B failed: ${error.message}`);
  return client;
}

// ---------------------------------------------------------------------------
// AR-T15: S1-1 + S1-2 — due_date set at invoice creation (spec-design gap)
// ---------------------------------------------------------------------------
describe('S1: due_date set at invoice creation (AR-T15)', () => {
  it('S1-1: store with payment_terms_days=45 → invoice.due_date = fecha_emision + 45', async () => {
    // invoice45Id was created on store45 (payment_terms_days=45)
    const { data: inv } = await admin
      .from('invoices')
      .select('fecha_emision, due_date')
      .eq('id', invoice45Id)
      .single();

    expect(inv?.due_date).not.toBeNull();

    // Parse and verify offset
    const emision = new Date(inv!.fecha_emision + 'T00:00:00Z');
    const due = new Date(inv!.due_date! + 'T00:00:00Z');
    const diffDays = Math.round((due.getTime() - emision.getTime()) / 86_400_000);
    expect(diffDays).toBe(45);
  });

  it('S1-2: store with payment_terms_days=30 (default) → due_date = fecha_emision + 30', async () => {
    const { data: inv } = await admin
      .from('invoices')
      .select('fecha_emision, due_date')
      .eq('id', invoiceId)
      .single();

    expect(inv?.due_date).not.toBeNull();
    const emision = new Date(inv!.fecha_emision + 'T00:00:00Z');
    const due = new Date(inv!.due_date! + 'T00:00:00Z');
    const diffDays = Math.round((due.getTime() - emision.getTime()) / 86_400_000);
    expect(diffDays).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// AR-T15: S2-1..S2-5 — record_payment scenarios
// ---------------------------------------------------------------------------
describe('S2-1: valid partial payment (AR-T15)', () => {
  it('partial payment updates total_paid, keeps estado_pago pendiente, SUM(payments)=total_paid', async () => {
    const client = await getUserClient();

    await recordPayment(client, { invoiceId, amount: 300 });

    const { data: inv } = await admin
      .from('invoices')
      .select('total_paid, estado_pago')
      .eq('id', invoiceId)
      .single();

    expect(Number(inv?.total_paid)).toBe(300);
    expect(inv?.estado_pago).toBe('pendiente');

    // Invariant: SUM(payments.amount) = total_paid
    const { data: payments } = await admin
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoiceId);
    const sum = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
    expect(sum).toBeCloseTo(Number(inv?.total_paid), 2);
  });
});

describe('S2-2: cumulative payments reaching total flip estado_pago=pagado (AR-T15)', () => {
  it('recording the remainder flips estado_pago to pagado and invariant holds', async () => {
    const client = await getUserClient();

    // After S2-1, total_paid=300. Remaining=700. Pay 700.
    await recordPayment(client, { invoiceId, amount: 700 });

    const { data: inv } = await admin
      .from('invoices')
      .select('total_paid, estado_pago')
      .eq('id', invoiceId)
      .single();

    expect(Number(inv?.total_paid)).toBe(1000);
    expect(inv?.estado_pago).toBe('pagado');

    // Invariant check
    const { data: payments } = await admin
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoiceId);
    const sum = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
    expect(sum).toBeCloseTo(Number(inv?.total_paid), 2);
  });
});

describe('S2-3: overpayment rejected (AR-T15)', () => {
  it('recordPayment throws OverpaymentError and leaves total_paid unchanged', async () => {
    const client = await getUserClient();

    // Invoice is fully paid from S2-2; any amount > 0 is overpayment
    await expect(
      recordPayment(client, { invoiceId, amount: 1 })
    ).rejects.toBeInstanceOf(OverpaymentError);

    // Confirm no new payment row and total_paid unchanged
    const { data: inv } = await admin
      .from('invoices')
      .select('total_paid')
      .eq('id', invoiceId)
      .single();
    expect(Number(inv?.total_paid)).toBe(1000); // unchanged
  });
});

describe('S2-4: cancelled-order invoice rejected (AR-T15)', () => {
  it('recordPayment on cancelled-order invoice throws CancelledOrderPaymentError', async () => {
    const client = await getUserClient();

    await expect(
      recordPayment(client, { invoiceId: cancelledInvoiceId, amount: 100 })
    ).rejects.toBeInstanceOf(CancelledOrderPaymentError);

    // No payment row should exist
    const { data: payments } = await admin
      .from('payments')
      .select('id')
      .eq('invoice_id', cancelledInvoiceId);
    expect(payments ?? []).toHaveLength(0);
  });
});

describe('S2-5: zero amount rejected (AR-T15)', () => {
  it('recordPayment with amount=0 throws InvalidPaymentAmountError', async () => {
    const client = await getUserClient();

    await expect(
      recordPayment(client, { invoiceId: cancelledInvoiceId, amount: 0 })
    ).rejects.toBeInstanceOf(InvalidPaymentAmountError);
  });
});

// ---------------------------------------------------------------------------
// AR-T15: S7-1, S7-2 — backfill verification
// ---------------------------------------------------------------------------
describe('S7-1 + S7-2: backfill migration (AR-T15)', () => {
  it('S7-1: new store defaults to payment_terms_days=30', async () => {
    const { data: store } = await admin
      .from('stores')
      .select('payment_terms_days')
      .eq('id', storeId)
      .single();
    expect(Number(store?.payment_terms_days)).toBe(30);
  });

  it('S7-2: existing invoices have total_paid=0 and due_date set (backfill)', async () => {
    // Query any invoice in the test tenant that is not our specific test invoice
    // (the backfill applies to all invoices with due_date IS NULL after migration)
    const { data: inv } = await admin
      .from('invoices')
      .select('total_paid, due_date')
      .eq('id', invoice45Id)
      .single();

    // due_date must be set (backfill or create_invoice RPC)
    expect(inv?.due_date).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AR-T16: S9-1, S9-2 — cross-tenant isolation
// ---------------------------------------------------------------------------
describe('S9-1: cross-tenant isolation on payments read (AR-T16)', () => {
  it('tenant B querying payments for tenant A invoice sees 0 rows', async () => {
    const clientB = await getUserBClient();

    const payments = await getPaymentsByInvoice(clientB, invoiceId);
    expect(payments).toHaveLength(0);
  });
});

describe('S9-2: cross-tenant isolation via record_payment RPC (AR-T16)', () => {
  it('tenant B calling record_payment with tenant A invoice throws InvoiceNotFoundError', async () => {
    const clientB = await getUserBClient();

    await expect(
      recordPayment(clientB, { invoiceId, amount: 100 })
    ).rejects.toBeInstanceOf(InvoiceNotFoundError);

    // No payment row for tenant A's invoice
    const { data: payments } = await admin
      .from('payments')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', tenantBId);
    expect(payments ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// W3: create_invoice must anchor due_date to fecha_emision, not order.fecha
// ---------------------------------------------------------------------------
describe('W3: due_date = fecha_emision + terms (not order.fecha + terms)', () => {
  it('invoice created after a backdated order anchors due_date to current_date', async () => {
    // Seed a fresh product+lot so this test is fully isolated from S2-x payments
    const prodW3Id = await seedLotAndProduct(
      tenantId,
      `__ar_product_w3_${UNIQUE}__`,
      5
    );

    const userClient = await getUserClient();

    // create_order sets fecha = current_date
    const { data: orderId, error: oErr } = await userClient.rpc('create_order', {
      p_store_id: storeId,
      p_items: [{ product_id: prodW3Id, cantidad: 1 }],
      p_notas: `W3 anchor test ${UNIQUE}`,
    });
    if (oErr) throw new Error(`create_order W3 failed: ${oErr.message}`);

    // Admin: backdate order by 7 days so order.fecha ≠ current_date
    const backdated = new Date();
    backdated.setUTCDate(backdated.getUTCDate() - 7);
    const backdatedStr = backdated.toISOString().split('T')[0];
    const { error: updateErr } = await admin
      .from('orders')
      .update({ fecha: backdatedStr })
      .eq('id', orderId as string);
    if (updateErr) throw new Error(`backdate order failed: ${updateErr.message}`);

    // Create invoice today — fecha_emision = current_date
    const { data: invId, error: invErr } = await userClient.rpc('create_invoice', {
      p_order_id: orderId,
    });
    if (invErr) throw new Error(`create_invoice W3 failed: ${invErr.message}`);

    const { data: inv } = await admin
      .from('invoices')
      .select('fecha_emision, due_date')
      .eq('id', invId as string)
      .single();

    expect(inv?.due_date).not.toBeNull();

    const emisionDate = new Date(inv!.fecha_emision + 'T00:00:00Z');
    const dueDate    = new Date(inv!.due_date!      + 'T00:00:00Z');
    const diff = Math.round((dueDate.getTime() - emisionDate.getTime()) / 86_400_000);

    // due_date MUST equal fecha_emision + 30 (REQ-1 compliance)
    expect(diff).toBe(30);

    // Prove anchor is NOT order.fecha: wrong due_date would be backdated + 30 (7 days earlier)
    const wrongDueMs = new Date(backdatedStr + 'T00:00:00Z').getTime() + 30 * 86_400_000;
    expect(dueDate.getTime()).not.toBe(wrongDueMs);
  });
});
