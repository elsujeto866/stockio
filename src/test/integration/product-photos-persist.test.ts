// @vitest-environment node
/**
 * Integration Tests — product image_path persistence + explicit-id create (PP-T27).
 *
 * Tests:
 *   - createProduct with explicit id → row.id matches provided id (D1)
 *   - createProduct with image_path → round-trips to DB (S2-1)
 *   - updateProduct image_path → row reflects updated path (S2-5)
 *   - updateProduct image_path to null → row has null (S2-6)
 *
 * Runs against REMOTE Supabase. Must be run in isolation to avoid
 * rate-limit errors: `npx vitest run src/test/integration/product-photos-persist.test.ts`
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createProduct, updateProduct, getProduct } from '@/lib/data/products';

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
const UNIQUE = Date.now().toString(36);

let tenantId: string;
let userId: string;
let client: SupabaseClient;

// Populated by createProduct tests (sequential within file)
let createdProductId: string;
let explicitProductId: string;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  const userEmail = `persist-photo+${UNIQUE}@stockio.test`;

  const { data: t, error: tErr } = await admin
    .from('tenants')
    .insert({ nombre: `__persist_photo_tenant_${UNIQUE}__` })
    .select('id')
    .single();
  if (tErr) throw new Error(`tenant: ${tErr.message}`);
  tenantId = t.id;

  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: userEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uErr) throw new Error(`user: ${uErr.message}`);
  userId = u.user.id;

  await admin
    .from('profiles')
    .insert({ id: userId, tenant_id: tenantId, nombre: 'Persist Photo User', rol: 'admin' });

  client = createBrowserStyleClient();
  const { error: signInErr } = await client.auth.signInWithPassword({
    email: userEmail,
    password: PASSWORD,
  });
  if (signInErr) throw new Error(`sign-in: ${signInErr.message}`);
}, 30_000);

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
afterAll(async () => {
  await client?.auth.signOut().catch(() => {});
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
});

// ---------------------------------------------------------------------------
// D1: explicit id supplied by client
// ---------------------------------------------------------------------------
describe('createProduct — explicit client-generated id (D1)', () => {
  it('row.id matches the explicit id passed in ProductInput.id', async () => {
    explicitProductId = crypto.randomUUID();

    const product = await createProduct(client, {
      id: explicitProductId,
      nombre: `Explicit ID Product ${UNIQUE}`,
      precio_unitario: 5,
      stock_actual: 10,
      stock_minimo: 1,
    });

    expect(product.id).toBe(explicitProductId);
  });
});

// ---------------------------------------------------------------------------
// S2-1: image_path round-trips to DB on create
// ---------------------------------------------------------------------------
describe('createProduct — image_path persisted (S2-1)', () => {
  it('image_path is stored and returned when provided on create', async () => {
    const fakeImagePath = `${tenantId}/test-product-${UNIQUE}.jpg`;

    const product = await createProduct(client, {
      nombre: `Photo Persist Product ${UNIQUE}`,
      precio_unitario: 12,
      stock_actual: 20,
      stock_minimo: 2,
      image_path: fakeImagePath,
    });

    createdProductId = product.id;
    expect(product.image_path).toBe(fakeImagePath);

    // Verify via getProduct (SELECT round-trip)
    const fetched = await getProduct(client, product.id);
    expect(fetched?.image_path).toBe(fakeImagePath);
  });

  it('image_path is null when not provided on create', async () => {
    const product = await createProduct(client, {
      nombre: `No Photo Product ${UNIQUE}`,
      precio_unitario: 8,
      stock_actual: 5,
      stock_minimo: 1,
    });

    expect(product.image_path).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// S2-5 / S2-6: image_path update
// ---------------------------------------------------------------------------
describe('updateProduct — image_path update (S2-5, S2-6)', () => {
  it('S2-5: updateProduct sets a new image_path', async () => {
    const newPath = `${tenantId}/updated-${UNIQUE}.jpg`;

    const updated = await updateProduct(client, createdProductId, {
      nombre: `Photo Persist Product ${UNIQUE}`,
      precio_unitario: 12,
      stock_actual: 20,
      stock_minimo: 2,
      image_path: newPath,
    });

    expect(updated.image_path).toBe(newPath);
  });

  it('S2-6: updateProduct clears image_path when set to null', async () => {
    const updated = await updateProduct(client, createdProductId, {
      nombre: `Photo Persist Product ${UNIQUE}`,
      precio_unitario: 12,
      stock_actual: 20,
      stock_minimo: 2,
      image_path: null,
    });

    expect(updated.image_path).toBeNull();
  });
});
