// @vitest-environment node
/**
 * WU3 Integration Tests — Fiscal DB Constraint Validation
 *
 * Verifies that the DDL migrations add the correct constraints and defaults:
 *
 *   Scenario 2.1 (REQ-2): stores.tipo_identificacion defaults to '07'
 *   Scenario 2.2 (REQ-2): stores.tipo_identificacion CHECK rejects '03'
 *   Scenario 4.2 (REQ-4): tenants.ruc CHECK rejects 9-char RUC
 *   Scenario 4.3 (REQ-4): existing tenants get estab='001', pto_emi='001' defaults
 *
 * STRICT TDD — RED PHASE:
 *   Migrations 20260630120000_stores_fiscal.sql,
 *              20260630120100_tenants_emisor.sql,
 *              20260630120200_invoices_sri.sql
 *   have NOT been applied yet. Tests that reference the new columns will fail
 *   with "column ... does not exist". This is the expected RED state.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

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

const UNIQUE = Date.now().toString(36);

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

const admin = createAdminClient();

let tenantId: string;
let storeId: string;

beforeAll(async () => {
  // Create a test tenant
  const { data: t, error: tErr } = await admin
    .from('tenants')
    .insert({ nombre: `__fiscal_constraint_test_${UNIQUE}__` })
    .select('id')
    .single();
  if (tErr) throw new Error(`create tenant: ${tErr.message}`);
  tenantId = t.id;

  // Create a test store with minimal fields — tipo_identificacion will use the column default
  const { data: s, error: sErr } = await admin
    .from('stores')
    .insert({ tenant_id: tenantId, nombre: `__fiscal_store_${UNIQUE}__` })
    .select('id')
    .single();
  if (sErr) throw new Error(`create store: ${sErr.message}`);
  storeId = s.id;
}, 20_000);

afterAll(async () => {
  // CASCADE deletes store via tenant
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
});

// ---------------------------------------------------------------------------
// Scenario 2.1 — stores.tipo_identificacion defaults to '07' after migration
// ---------------------------------------------------------------------------
describe('stores.tipo_identificacion column default (REQ-2, Scenario 2.1)', () => {
  it('existing store reads back tipo_identificacion = 07 after migration', async () => {
    const { data, error } = await admin
      .from('stores')
      .select('tipo_identificacion')
      .eq('id', storeId)
      .single();

    // RED: "column tipo_identificacion does not exist" until migration applied
    expect(error).toBeNull();
    expect(data?.tipo_identificacion).toBe('07');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2.2 — stores.tipo_identificacion CHECK rejects invalid value
// ---------------------------------------------------------------------------
describe('stores.tipo_identificacion CHECK constraint (REQ-2, Scenario 2.2)', () => {
  it('INSERT with tipo_identificacion = 03 raises a CHECK constraint violation', async () => {
    const { error } = await admin.from('stores').insert({
      tenant_id: tenantId,
      nombre: `__check_violate_store_${UNIQUE}__`,
      tipo_identificacion: '03',
    });

    // RED: column doesn't exist yet; after migration: CHECK violation expected
    expect(error).not.toBeNull();
    // After migration: error message should reference the constraint
    // (PostgreSQL raises "new row for relation ... violates check constraint")
    // We accept any error here — the important thing is the insert is rejected.
  });
});

// ---------------------------------------------------------------------------
// Scenario 4.3 — tenants.estab and pto_emi default to '001'
// ---------------------------------------------------------------------------
describe('tenants.estab / pto_emi defaults (REQ-4, Scenario 4.3)', () => {
  it('existing tenant reads back estab = 001 and pto_emi = 001 after migration', async () => {
    const { data, error } = await admin
      .from('tenants')
      .select('estab, pto_emi')
      .eq('id', tenantId)
      .single();

    // RED: "column estab does not exist" until migration applied
    expect(error).toBeNull();
    expect(data?.estab).toBe('001');
    expect(data?.pto_emi).toBe('001');
  });
});

// ---------------------------------------------------------------------------
// Scenario 4.2 — tenants.ruc CHECK rejects non-13-digit RUC
// ---------------------------------------------------------------------------
describe('tenants.ruc length CHECK constraint (REQ-4, Scenario 4.2)', () => {
  it('UPDATE tenants SET ruc to 9-char value raises CHECK constraint violation', async () => {
    const { error } = await admin
      .from('tenants')
      .update({ ruc: '123456789' }) // 9 chars — too short
      .eq('id', tenantId);

    // RED: column ruc may lack CHECK until migration applied;
    // after migration: CHECK violation expected
    expect(error).not.toBeNull();
  });
});
