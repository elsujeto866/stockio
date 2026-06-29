/**
 * Purchases E2E tests — full purchase lifecycle.
 *
 * Uses the throwaway test tenant+user provisioned by e2e/global-setup.ts.
 * Tests run against the live dev server (npm run dev) on http://localhost:3000.
 *
 * Journey:
 *   S1 (REQ-P1): create purchase via ProductPicker — deterministic search+click
 *     → Redirected to /purchases/{id}
 *     → "Purchase items" line item asserted BEFORE submit (unconditional)
 *     → Detail shows Recibido status after redirect
 *   S2 (REQ-P2 cancel): cancel the Recibido purchase from S1 → Cancelado
 *   S3 (REQ-P2 UI guard): create a second purchase via picker → cancel button visible
 *     (negative-stock blocking is covered in integration tests at B-T05)
 *
 * All three scenarios run unconditionally — NO test.skip(), NO if(count) fallbacks.
 * Suite is serial so S2 always follows S1, and S3 creates its own fresh purchase.
 *
 * beforeAll seeds: 1 supplier + 1 product (unique SUFFIX to avoid cross-run collision).
 * Cleanup: global-teardown.ts deletes the throwaway tenant, cascading to all
 * purchases, products and suppliers created here. No per-test cleanup needed.
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
// Admin client factory (bypasses RLS — same as visual-product-picker.spec.ts)
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
const SUPPLIER_NAME = `E2E Supplier ${SUFFIX}`;
const PRODUCT_NAME = `E2E Purchase Product ${SUFFIX}`;

let seededSupplierId: string;
/** Set by S1; consumed by S2 so it can navigate directly to the Recibido detail. */
let createdPurchaseUrl: string;

// ---------------------------------------------------------------------------
// Seed: one supplier + one product for the throwaway test tenant
// ---------------------------------------------------------------------------
test.beforeAll(async () => {
  const admin = makeAdmin();
  const tenantId = creds.tenantId;

  // Supplier
  const { data: supplier, error: supplierErr } = await admin
    .from('suppliers')
    .insert({ nombre: SUPPLIER_NAME, tenant_id: tenantId, activo: true })
    .select('id')
    .single();
  if (supplierErr) throw new Error(`[Purchases E2E] Seed supplier: ${supplierErr.message}`);
  seededSupplierId = (supplier as { id: string }).id;

  // Product — stock_actual=50 so the picker shows it as available
  const { data: product, error: productErr } = await admin
    .from('products')
    .insert({
      nombre: PRODUCT_NAME,
      precio_unitario: 10.0,
      stock_actual: 50,
      stock_minimo: 5,
      tenant_id: tenantId,
      activo: true,
    })
    .select('id')
    .single();
  if (productErr) throw new Error(`[Purchases E2E] Seed product: ${productErr.message}`);

  console.log(
    `[Purchases E2E] Seeded supplier ${seededSupplierId}, product ${(product as { id: string }).id}`
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

/**
 * Open the ProductPicker dialog on /purchases/new, filter by name, click the
 * matching card, then click Agregar to add the line item.
 *
 * Unconditional: hard-fails if the picker does not show a card for PRODUCT_NAME.
 * No test.skip(), no if(count) fallback, no waitForTimeout.
 */
async function addProductViaPickerOnPurchasesNew(page: Page): Promise<void> {
  // Open picker dialog
  await page.click('button[aria-label="Agregar producto"]');
  const dialog = page.getByRole('dialog', { name: /seleccionar producto/i });
  await expect(dialog).toBeVisible();

  // Filter by the unique product name
  const searchInput = dialog.getByLabel(/buscar producto/i);
  await searchInput.fill(PRODUCT_NAME);

  // The matching card must be visible — hard-fails if the product was not seeded
  const productCard = dialog.getByRole('button', { name: new RegExp(PRODUCT_NAME, 'i') });
  await expect(productCard).toBeVisible();

  // Click the card; dialog closes
  await productCard.click();
  await expect(dialog).not.toBeVisible();

  // Click Agregar to commit the line item
  await page.getByRole('button', { name: /^agregar$/i }).click();
}

// ---------------------------------------------------------------------------
// Test suite — serial so S2 can rely on the purchase created by S1
// ---------------------------------------------------------------------------
test.describe('Purchases management', () => {
  test.describe.configure({ mode: 'serial' });

  // -------------------------------------------------------------------------
  // S1 (REQ-P1): create purchase via ProductPicker
  // -------------------------------------------------------------------------
  test(
    'S1 (REQ-P1): create purchase via picker → line item visible + redirect to Recibido detail',
    async ({ page }) => {
      await login(page);
      await page.goto('/purchases/new');

      // Select the seeded supplier — no fallback; hard-fail if missing
      await page.selectOption('select[name="supplierId"]', seededSupplierId);

      // Open picker → filter → click specific card → Agregar
      await addProductViaPickerOnPurchasesNew(page);

      // UNCONDITIONAL: assert the line item is in the builder list before submitting.
      // No if/else — a missing line item is a test failure.
      const purchaseItems = page.locator('ul[aria-label="Purchase items"]');
      await expect(purchaseItems).toBeVisible();
      await expect(purchaseItems.getByText(PRODUCT_NAME)).toBeVisible();

      // Fill costoUnitario for the line
      await page.getByLabel(`Costo unitario de ${PRODUCT_NAME}`).fill('5.00');

      // Submit
      await page.getByRole('button', { name: /crear compra/i }).click();

      // Redirected to detail page
      await expect(page).toHaveURL(/\/purchases\/[\w-]+$/);
      await expect(page.getByRole('status')).toHaveText(/recibido/i);

      // Capture the detail URL so S2 can navigate here directly (serial dependency)
      createdPurchaseUrl = page.url();
    }
  );

  // -------------------------------------------------------------------------
  // S2 (REQ-P2 cancel): cancel the Recibido purchase created by S1
  // -------------------------------------------------------------------------
  test(
    'S2 (REQ-P2 cancel): cancel Recibido purchase → estado=Cancelado, button gone',
    async ({ page }) => {
      await login(page);

      // Navigate directly to the detail page created by S1 (serial predecessor).
      // createdPurchaseUrl is set unconditionally by S1; if S1 failed, this test
      // never runs because the suite is serial.
      await page.goto(createdPurchaseUrl);
      await expect(page).toHaveURL(/\/purchases\/[\w-]+$/);

      // Hard-fail if the status is not Recibido (S1 should have created it that way)
      await expect(page.getByRole('status')).toHaveText(/recibido/i);

      // Cancel the purchase
      await page.getByRole('button', { name: /cancelar compra/i }).click();

      // Estado badge changes to "Cancelado"
      await expect(page.getByRole('status')).toHaveText(/cancelado/i, { timeout: 5000 });

      // Cancel button disappears (estado is no longer recibido)
      await expect(page.getByRole('button', { name: /cancelar compra/i })).not.toBeVisible();
    }
  );

  // -------------------------------------------------------------------------
  // S3 (REQ-P2 UI guard): cancel button renders on a Recibido purchase
  //
  // S2 consumed S1's Recibido purchase, so S3 creates a fresh one via the picker.
  // The negative-stock blocking behaviour is covered in integration tests (B-T05).
  // This scenario validates only that the cancel button renders without a 500 error.
  // -------------------------------------------------------------------------
  test(
    'S3 (REQ-P2 UI guard): create fresh purchase via picker → cancel button visible on detail',
    async ({ page }) => {
      await login(page);
      await page.goto('/purchases/new');

      // Select the seeded supplier
      await page.selectOption('select[name="supplierId"]', seededSupplierId);

      // Open picker → filter → click specific card → Agregar
      await addProductViaPickerOnPurchasesNew(page);

      // Fill costoUnitario and submit
      await page.getByLabel(`Costo unitario de ${PRODUCT_NAME}`).fill('2.00');
      await page.getByRole('button', { name: /crear compra/i }).click();

      // Redirected to detail page
      await expect(page).toHaveURL(/\/purchases\/[\w-]+$/);
      await expect(page.getByRole('status')).toHaveText(/recibido/i);

      // Cancel button must be visible (not a 500); unconditional assertion
      await expect(page.getByRole('button', { name: /cancelar compra/i })).toBeVisible();
    }
  );
});
