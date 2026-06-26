/**
 * Orders E2E tests — full order lifecycle.
 *
 * Uses the throwaway test tenant+user provisioned by e2e/global-setup.ts.
 * Pre-seeds a store and two products via the Supabase admin client (same
 * pattern as global-setup) so tests are fast and deterministic.
 *
 * Scenarios:
 *   S1: create 2-line order → appears in history → detail shows frozen prices
 *       + authoritative total → mark as delivered → Cancel button absent
 *   S2: create order → cancel → product stock is restored to pre-order level
 *   S3: attempt order with insufficient stock → friendly error names the product
 *
 * Cleanup: global-teardown deletes the entire throwaway tenant, which cascades
 * to all rows created here. No per-test cleanup needed.
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Credentials shape — includes tenantId written by global-setup
// ---------------------------------------------------------------------------
interface E2ECredentials {
  email: string;
  password: string;
  userId: string;
  tenantId: string;
}

const creds: E2ECredentials = JSON.parse(
  readFileSync(join(process.cwd(), 'e2e', '.test-credentials.json'), 'utf-8')
);

// ---------------------------------------------------------------------------
// WebSocket stub — same as global-setup (suppresses realtime on Node 20)
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
// Env loader — re-reads .env.local in the test process (mirrors global-setup)
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

// ---------------------------------------------------------------------------
// Admin client factory (uses SUPABASE_SECRET_KEY to bypass RLS)
// ---------------------------------------------------------------------------
function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secretKey = process.env.SUPABASE_SECRET_KEY!;
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: _NoopWebSocket as never },
  });
}

// ---------------------------------------------------------------------------
// Unique names so parallel runs and retries don't collide
// ---------------------------------------------------------------------------
const SUFFIX = Date.now().toString(36);
const STORE_NAME = `E2E Orders Store ${SUFFIX}`;
const PRODUCT_A_NAME = `E2E Widget ${SUFFIX}`;
const PRODUCT_B_NAME = `E2E Gadget ${SUFFIX}`;

// Shared seed IDs, set in beforeAll
let seededStoreId: string;
let seededProductAId: string;
let seededProductBId: string;

// ---------------------------------------------------------------------------
// Seed: one store + two products for the throwaway test tenant
// ---------------------------------------------------------------------------
test.beforeAll(async () => {
  const admin = makeAdmin();
  const tenantId = creds.tenantId;

  // Store
  const { data: store, error: storeErr } = await admin
    .from('stores')
    .insert({ nombre: STORE_NAME, tenant_id: tenantId, activo: true })
    .select('id')
    .single();
  if (storeErr) throw new Error(`[E2E orders] Seed store: ${storeErr.message}`);
  seededStoreId = (store as { id: string }).id;

  // Product A — $10.00, stock 50
  const { data: pA, error: pAErr } = await admin
    .from('products')
    .insert({
      nombre: PRODUCT_A_NAME,
      precio_unitario: 10.00,
      stock_actual: 50,
      stock_minimo: 5,
      tenant_id: tenantId,
      activo: true,
    })
    .select('id')
    .single();
  if (pAErr) throw new Error(`[E2E orders] Seed product A: ${pAErr.message}`);
  seededProductAId = (pA as { id: string }).id;

  // Product B — $20.00, stock 5
  const { data: pB, error: pBErr } = await admin
    .from('products')
    .insert({
      nombre: PRODUCT_B_NAME,
      precio_unitario: 20.00,
      stock_actual: 5,
      stock_minimo: 2,
      tenant_id: tenantId,
      activo: true,
    })
    .select('id')
    .single();
  if (pBErr) throw new Error(`[E2E orders] Seed product B: ${pBErr.message}`);
  seededProductBId = (pB as { id: string }).id;

  console.log(
    `[E2E orders] Seeded store ${seededStoreId}, ` +
    `product A ${seededProductAId}, product B ${seededProductBId}`
  );
});

// ---------------------------------------------------------------------------
// Shared helper: log in
// ---------------------------------------------------------------------------
async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

// ---------------------------------------------------------------------------
// S1 — create 2-line order → history → detail → mark delivered → cancel absent
// ---------------------------------------------------------------------------
test.describe('Orders management', () => {
  test('S1: create 2-line order → history → detail shows frozen prices → mark delivered → cancel absent', async ({
    page,
  }) => {
    await login(page);

    // Navigate to new order
    await page.goto('/orders/new');

    // Select the seeded store
    await page.selectOption('select[name="storeId"]', seededStoreId);

    // Add product A (select → Add, then increment to cantidad 2)
    await page.selectOption('select[aria-label="Select a product to add"]', seededProductAId);
    await page.click('button:has-text("Add")');
    await page.click(`button[aria-label="Increase quantity of ${PRODUCT_A_NAME}"]`);

    // Add product B (cantidad 1)
    await page.selectOption('select[aria-label="Select a product to add"]', seededProductBId);
    await page.click('button:has-text("Add")');

    // Preview total: 2×10 + 1×20 = $40.00
    await expect(page.getByLabel('Estimated total')).toHaveText('$40.00');

    // Submit
    await page.click('button[type="submit"]:has-text("Create order")');

    // Lands on /orders/<uuid>
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);

    // Detail shows store name
    await expect(page.getByText(STORE_NAME)).toBeVisible();

    // Estado badge = Pending
    await expect(page.getByRole('status')).toHaveText(/Pending/i);

    // Line items show both product names
    await expect(page.getByText(PRODUCT_A_NAME)).toBeVisible();
    await expect(page.getByText(PRODUCT_B_NAME)).toBeVisible();

    // Frozen prices are displayed.
    // $10.00 is unique (only precio_unitario of A).
    // For B we scope to the list item containing its name to avoid ambiguity
    // when $20.00 appears multiple times (subtotal A=20, precio B=20, subtotal B=20).
    await expect(page.getByText('$10.00')).toBeVisible();
    await expect(
      page.locator('li', { has: page.getByText(PRODUCT_B_NAME) }).getByText('$20.00').first()
    ).toBeVisible();

    // Authoritative total from DB ($40.00)
    await expect(page.getByText('$40.00')).toBeVisible();

    // Mark as delivered
    await page.click('button:has-text("Mark as delivered")');

    // Status badge updates to Delivered
    await expect(page.getByRole('status')).toHaveText(/Delivered/i);

    // Cancel button is now absent
    await expect(
      page.getByRole('button', { name: /cancel order/i })
    ).not.toBeVisible();

    // Navigate to /orders — history shows the order card with the store name.
    // Use locator scoped to h2 to avoid also matching the store option in the
    // OrderFilters <select> (strict mode violation with plain getByText).
    await page.goto('/orders');
    await expect(page.locator('h2', { hasText: STORE_NAME })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // S2 — create order → cancel → stock restored
  // ---------------------------------------------------------------------------
  test('S2: create order → cancel → product stock is restored', async ({ page }) => {
    await login(page);
    const admin = makeAdmin();

    // Record stock of product B before creating the order
    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', seededProductBId)
      .single();
    const stockBefore = (before as { stock_actual: number } | null)?.stock_actual ?? 0;

    // Create order with product B (cantidad 1)
    await page.goto('/orders/new');
    await page.selectOption('select[name="storeId"]', seededStoreId);
    await page.selectOption('select[aria-label="Select a product to add"]', seededProductBId);
    await page.click('button:has-text("Add")');
    await page.click('button[type="submit"]:has-text("Create order")');
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);

    // Cancel the order
    await page.click('button:has-text("Cancel order")');
    await expect(page.getByRole('status')).toHaveText(/Cancelled/i);

    // Check stock has been restored (via admin client — DB read after cancel)
    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', seededProductBId)
      .single();
    const stockAfter = (after as { stock_actual: number } | null)?.stock_actual ?? 0;

    expect(stockAfter).toBe(stockBefore);
  });

  // ---------------------------------------------------------------------------
  // S3 — insufficient stock → friendly error names the product
  // ---------------------------------------------------------------------------
  test('S3: insufficient stock shows friendly error with product name', async ({ page }) => {
    await login(page);
    const admin = makeAdmin();

    // Force product A stock to 1 so requesting 5 triggers the RPC error
    await admin
      .from('products')
      .update({ stock_actual: 1 })
      .eq('id', seededProductAId);

    await page.goto('/orders/new');
    await page.selectOption('select[name="storeId"]', seededStoreId);
    await page.selectOption('select[aria-label="Select a product to add"]', seededProductAId);
    await page.click('button:has-text("Add")');

    // Increment to 5 (need 4 more clicks after the initial add gives cantidad=1)
    for (let i = 0; i < 4; i++) {
      await page.click(`button[aria-label="Increase quantity of ${PRODUCT_A_NAME}"]`);
    }

    await page.click('button[type="submit"]:has-text("Create order")');

    // Should stay on /orders/new (action returns insufficientStock, no redirect)
    await expect(page).toHaveURL('/orders/new');

    // Error alert is visible and contains the product name.
    // Use a scoped locator to avoid matching the Next.js route announcer.
    const alert = page.locator('p[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(PRODUCT_A_NAME);
  });
});
