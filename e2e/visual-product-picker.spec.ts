/**
 * Visual Product Picker E2E smoke test (VPP-T11).
 *
 * One unconditional scenario:
 *   Navigate to /orders/new → open picker dialog → filter by product name →
 *   click card → dialog closes → click Agregar → line item appears.
 *
 * Assertions are UNCONDITIONAL — no if(count) soft fallbacks.
 * No page.waitForTimeout() — all waits use await expect() with implicit retry.
 *
 * Uses the throwaway test tenant provisioned by e2e/global-setup.ts.
 * Seeds its own store + product in beforeAll so it never depends on other
 * E2E spec data.
 * Cleanup: global-teardown cascades deletion of the test tenant.
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Credentials
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
// WebSocket stub (suppresses realtime on Node 20 — same as other E2E specs)
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
// Env loader (mirrors global-setup.ts)
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
// Admin client factory (bypasses RLS — same as orders.spec.ts)
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
// Unique identifiers (avoid collision across parallel runs)
// ---------------------------------------------------------------------------
const SUFFIX = Date.now().toString(36);
const STORE_NAME = `VPP Store ${SUFFIX}`;
const PRODUCT_NAME = `VPP Leche ${SUFFIX}`;

let seededStoreId: string;

// ---------------------------------------------------------------------------
// Seed: one store + one product for the throwaway test tenant
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
  if (storeErr) throw new Error(`[VPP E2E] Seed store: ${storeErr.message}`);
  seededStoreId = (store as { id: string }).id;

  // Product — $15.00, stock 20
  const { data: product, error: productErr } = await admin
    .from('products')
    .insert({
      nombre: PRODUCT_NAME,
      precio_unitario: 15.0,
      stock_actual: 20,
      stock_minimo: 5,
      tenant_id: tenantId,
      activo: true,
    })
    .select('id')
    .single();
  if (productErr) throw new Error(`[VPP E2E] Seed product: ${productErr.message}`);

  console.log(
    `[VPP E2E] Seeded store ${seededStoreId}, product ${(product as { id: string }).id}`
  );
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

// ---------------------------------------------------------------------------
// VPP-S1: open picker → search → click card → dialog closes → line item appears
// ---------------------------------------------------------------------------
test.describe('Visual Product Picker', () => {
  test(
    'VPP-S1: open picker → filter → click card → dialog closes → line item appears in order',
    async ({ page }) => {
      await login(page);

      // Navigate to new order
      await page.goto('/orders/new');

      // Select the seeded store
      await page.selectOption('select[name="storeId"]', seededStoreId);

      // ── Open the product picker ──────────────────────────────────
      await page.click('button[aria-label="Agregar producto"]');

      // Dialog is visible — validates that showModal() fires in a real browser
      // (behavior jsdom cannot test because it lacks showModal()).
      const dialog = page.getByRole('dialog', { name: /seleccionar producto/i });
      await expect(dialog).toBeVisible();

      // ── Filter by product name ───────────────────────────────────
      const searchInput = dialog.getByLabel(/buscar producto/i);
      await searchInput.fill(PRODUCT_NAME);

      // Matching card appears in the dialog
      const productCard = dialog.getByRole('button', { name: new RegExp(PRODUCT_NAME, 'i') });
      await expect(productCard).toBeVisible();

      // ── Click the card ──────────────────────────────────────────
      await productCard.click();

      // Dialog is NOT visible after selection — close() was called
      await expect(dialog).not.toBeVisible();

      // ── Click the inline Agregar button ─────────────────────────
      // After picker closes, selectedProductId is set → Agregar button enabled.
      await page.getByRole('button', { name: /^agregar$/i }).click();

      // ── Assert line item appears ─────────────────────────────────
      // UNCONDITIONAL: no if(count) escape hatch. If the product is missing
      // the assertion must FAIL.
      const lineItems = page.locator('ul[aria-label="Order items"]');
      await expect(lineItems).toBeVisible();
      await expect(lineItems.getByText(PRODUCT_NAME)).toBeVisible();
    }
  );
});
