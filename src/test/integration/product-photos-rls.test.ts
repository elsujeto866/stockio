// @vitest-environment node
/**
 * Integration Tests — product-photos Storage RLS (PP-T25, PP-T26).
 *
 * Tests:
 *   S3-1: Tenant A can upload to own folder (ALLOWED)
 *   S3-2: Tenant A can read their own object (ALLOWED)
 *   S3-3: Tenant B CANNOT read Tenant A's object (DENIED)
 *   S3-4: Tenant B CANNOT upload to Tenant A's folder (DENIED)
 *
 * Runs against REMOTE Supabase. Must be run in isolation to avoid
 * rate-limit errors: `npx vitest run src/test/integration/product-photos-rls.test.ts`
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// WebSocket stub (standard integration test pattern in this repo)
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
// Fixtures
// ---------------------------------------------------------------------------
const admin = createAdminClient();
const PASSWORD = 'TestPass123!';
const BUCKET = 'product-photos';
const UNIQUE = Date.now().toString(36);

let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;

let clientA: SupabaseClient;
let clientB: SupabaseClient;

/** Path uploaded by Tenant A — used across tests */
const PHOTO_PATH_A = `__rls_test_path_placeholder__/photo-${UNIQUE}.jpg`;

// We replace the placeholder with the real tenantAId in beforeAll.
let objectPath: string;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  const userAEmail = `rls-photo-a+${UNIQUE}@stockio.test`;
  const userBEmail = `rls-photo-b+${UNIQUE}@stockio.test`;

  // Tenants
  const { data: tA, error: tAErr } = await admin
    .from('tenants')
    .insert({ nombre: `__rls_photo_tenant_a_${UNIQUE}__` })
    .select('id')
    .single();
  if (tAErr) throw new Error(`tenant A: ${tAErr.message}`);
  tenantAId = tA.id;

  const { data: tB, error: tBErr } = await admin
    .from('tenants')
    .insert({ nombre: `__rls_photo_tenant_b_${UNIQUE}__` })
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
  await admin
    .from('profiles')
    .insert({ id: userAId, tenant_id: tenantAId, nombre: 'RLS Photo A', rol: 'admin' });
  await admin
    .from('profiles')
    .insert({ id: userBId, tenant_id: tenantBId, nombre: 'RLS Photo B', rol: 'admin' });

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

  // Build the actual object path using real tenantAId
  objectPath = `${tenantAId}/photo-${UNIQUE}.jpg`;
}, 30_000);

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
afterAll(async () => {
  // Clean up storage object — ignore errors (may not exist if upload failed)
  if (objectPath) {
    await admin.storage.from(BUCKET).remove([objectPath]).catch(() => {});
  }
  await clientA?.auth.signOut().catch(() => {});
  await clientB?.auth.signOut().catch(() => {});
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  if (tenantAId) await admin.from('tenants').delete().eq('id', tenantAId);
  if (tenantBId) await admin.from('tenants').delete().eq('id', tenantBId);
});

// ---------------------------------------------------------------------------
// S3-1: Own-tenant upload ALLOWED (PP-T26)
// ---------------------------------------------------------------------------
describe('Storage RLS — own-tenant access (S3-1, S3-2)', () => {
  it('S3-1: Tenant A can upload to their own folder', async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
    const { error } = await clientA.storage.from(BUCKET).upload(objectPath, blob, {
      upsert: true,
      contentType: 'image/jpeg',
    });
    expect(error).toBeNull();
  });

  it('S3-2: Tenant A can get a signed URL for their own object', async () => {
    const { data, error } = await clientA.storage.from(BUCKET).createSignedUrls(
      [objectPath],
      60
    );
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // First item should have a signedUrl and no item-level error
    const item = data![0];
    expect(item.signedUrl).toBeTruthy();
    expect(item.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S3-3 / S3-4: Cross-tenant DENIAL (PP-T25 — highest risk)
// ---------------------------------------------------------------------------
describe('Storage RLS — cross-tenant isolation (S3-3, S3-4)', () => {
  it('S3-3: Tenant B CANNOT get a signed URL for Tenant A object (RLS denial)', async () => {
    // Supabase Storage RLS: createSignedUrls succeeds at the API level but the
    // item.error is set to a non-null value when the policy denies access.
    // In some versions the top-level error is set instead.
    const { data, error } = await clientB.storage.from(BUCKET).createSignedUrls(
      [objectPath],
      60
    );

    // Either the call itself errors OR the per-item error is non-null
    // OR the signedUrl is empty/null (policy blocked object enumeration).
    const denied =
      !!error ||
      (data != null && (data[0]?.error != null || !data[0]?.signedUrl));

    expect(denied).toBe(true);
  });

  it('S3-4: Tenant B CANNOT upload to Tenant A folder (RLS denial)', async () => {
    const crossPath = `${tenantAId}/cross-tenant-attempt-${UNIQUE}.jpg`;
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });

    const { error } = await clientB.storage.from(BUCKET).upload(crossPath, blob, {
      upsert: true,
      contentType: 'image/jpeg',
    });

    // Must fail — RLS policy blocks writes to another tenant's folder.
    expect(error).not.toBeNull();
  });
});
