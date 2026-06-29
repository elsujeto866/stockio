/**
 * Product Photos E2E tests — PP-T20 / PP-T28.
 *
 * REQ-1 (S1-1), REQ-4 (S4-1), REQ-5 (S5-1, S5-3, S5-4).
 *
 * Scenarios:
 *   PHOTO-S1: create product with photo → thumbnail visible in catalog (S5-1)
 *   PHOTO-S2: add photo product to order → real <img> on order line row (S5-3)
 *   PHOTO-S3: add photo product to purchase → real <img> on purchase line row (S5-4)
 *
 * S5-2 (product detail, size=240) is covered by ProductThumbnail unit tests:
 *   the detail page resolves image_path → getSignedUrls → ProductThumbnail(url, size=240).
 *   The product catalog card has no navigation link to the detail page, so asserting it
 *   end-to-end would require an additional navigation helper with no marginal value over
 *   the unit test that already covers the same code path.
 *
 * Serial dependency: PHOTO-S2 and PHOTO-S3 depend on PHOTO-S1 having persisted the
 * photo product to the shared test-tenant DB. The describe block is configured as serial
 * so S1 always precedes S2 and S3. If S1 fails, S2/S3 hard-fail (no soft fallback).
 *
 * Uses the throwaway test tenant provisioned by e2e/global-setup.ts.
 * Cleanup: global-teardown deletes the entire throwaway tenant → all rows cascade.
 * Storage objects are NOT cleaned up (deferred orphan per proposal — soft-delete out of scope).
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import path from 'path';

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
// Helpers
// ---------------------------------------------------------------------------
const SUFFIX = Date.now().toString(36);
const PRODUCT_NAME = `E2E Photo Product ${SUFFIX}`;
const FIXTURE_PATH = path.join(process.cwd(), 'e2e', 'fixtures', 'test-image.png');

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

/**
 * Select a <select> option whose text CONTAINS partialText.
 * Hard-fails (throws) if no matching option is found — never falls back to another option.
 *
 * Necessary for the order selector where option labels include a price suffix
 * (e.g. "My Product — $15.00") so we can't predict the exact label up front,
 * but we know the product name is unique within the test tenant.
 */
async function selectOptionByPartialText(
  page: Page,
  selectLocator: ReturnType<Page['locator']>,
  partialText: string,
  timeoutMs = 10000
): Promise<void> {
  // Wait until an option containing the partial text is attached to the DOM.
  await expect(
    selectLocator.locator('option', { hasText: partialText })
  ).toBeAttached({ timeout: timeoutMs });

  const allTexts = await selectLocator.locator('option').allTextContents();
  const match = allTexts.find((t) => t.includes(partialText));
  if (!match) {
    throw new Error(
      `selectOptionByPartialText: no option containing "${partialText}" found.\n` +
      `Available options: ${JSON.stringify(allTexts)}`
    );
  }
  await selectLocator.selectOption({ label: match.trim() });
}

// ---------------------------------------------------------------------------
// Test suite — serial so S2/S3 always run after S1 has persisted the product
// ---------------------------------------------------------------------------
test.describe('Product Photos', () => {
  test.describe.configure({ mode: 'serial' });

  // -------------------------------------------------------------------------
  // PHOTO-S1: create product with photo → thumbnail in catalog
  // -------------------------------------------------------------------------
  test('PHOTO-S1: upload photo on create → thumbnail visible in catalog (S5-1)', async ({ page }) => {
    await login(page);

    // Navigate to new product form
    await page.goto('/products/new');

    // Upload the test fixture image via setInputFiles
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PATH);

    // Wait for the upload to complete (preview image should appear in form)
    await expect(page.locator('img[alt="Vista previa"]')).toBeVisible({ timeout: 15000 });

    // Fill in required product fields
    await page.fill('[name=nombre]', PRODUCT_NAME);
    await page.fill('[name=precio_unitario]', '15');
    await page.fill('[name=stock_actual]', '50');
    await page.fill('[name=stock_minimo]', '5');

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to products catalog
    await expect(page).toHaveURL('/products');

    // Find the product card and assert thumbnail is visible (non-empty src)
    const productCard = page.locator(`text=${PRODUCT_NAME}`).first();
    await expect(productCard).toBeVisible({ timeout: 10000 });

    // The thumbnail img should be present and have a non-empty src (signed URL)
    const thumbnailImg = productCard
      .locator('..').locator('..')
      .locator('img');

    await expect(thumbnailImg).toBeVisible({ timeout: 10000 });
    const src = await thumbnailImg.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toBe('');
  });

  // -------------------------------------------------------------------------
  // PHOTO-S2: add photo product to order → real <img> on order line row (S5-3)
  // -------------------------------------------------------------------------
  test('PHOTO-S2: add photo product to order → real thumbnail on order line row (S5-3)', async ({ page }) => {
    await login(page);

    // Navigate to new order
    await page.goto('/orders/new');

    // Open ProductPicker dialog and select the photo product created in PHOTO-S1.
    // Hard-fails if the picker doesn't show a card matching PRODUCT_NAME.
    await page.click('button[aria-label="Agregar producto"]');
    const dialog = page.getByRole('dialog', { name: /seleccionar producto/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Filter by name so only this product's card is visible.
    const searchInput = dialog.getByLabel(/buscar producto/i);
    await searchInput.fill(PRODUCT_NAME);

    // Click the matching card — no fallback.
    const productCard = dialog.getByRole('button', { name: new RegExp(PRODUCT_NAME, 'i') });
    await expect(productCard).toBeVisible({ timeout: 10000 });
    await productCard.click();
    await expect(dialog).not.toBeVisible();

    // Click "Agregar" to add the line item
    await page.getByRole('button', { name: /^agregar$/i }).click();

    // The order-line items list must appear
    const lineItems = page.locator('ul[aria-label="Order items"]');
    await expect(lineItems).toBeVisible({ timeout: 5000 });

    // Assert UNCONDITIONALLY that a real <img> with a signed URL renders on the line row.
    // ProductThumbnail renders <Image unoptimized> when url is truthy; with unoptimized,
    // Next.js emits a plain <img> with the original signed storage URL (?token=...).
    // There is NO if/else escape hatch: if the img is absent, this test must FAIL.
    const firstRow = lineItems.locator('li').first();
    await expect(firstRow).toBeVisible({ timeout: 5000 });

    const thumbnailImg = firstRow.locator('img');
    await expect(thumbnailImg).toBeVisible({ timeout: 5000 });
    const src = await thumbnailImg.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toBe('');
  });

  // -------------------------------------------------------------------------
  // PHOTO-S3: add photo product to purchase → real <img> on purchase line row (S5-4)
  // -------------------------------------------------------------------------
  test('PHOTO-S3: add photo product to purchase → real thumbnail on purchase line row (S5-4)', async ({ page }) => {
    await login(page);

    // Navigate to new purchase
    await page.goto('/purchases/new');

    // Open ProductPicker dialog and select the photo product created in PHOTO-S1.
    // Hard-fails if the picker doesn't show a card matching PRODUCT_NAME.
    await page.click('button[aria-label="Agregar producto"]');
    const dialog = page.getByRole('dialog', { name: /seleccionar producto/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Filter by name so only this product's card is visible.
    const searchInput = dialog.getByLabel(/buscar producto/i);
    await searchInput.fill(PRODUCT_NAME);

    // Click the matching card — no fallback.
    const productCard = dialog.getByRole('button', { name: new RegExp(PRODUCT_NAME, 'i') });
    await expect(productCard).toBeVisible({ timeout: 10000 });
    await productCard.click();
    await expect(dialog).not.toBeVisible();

    // Click "Agregar" to add the line item
    await page.getByRole('button', { name: /^agregar$/i }).click();

    // The purchase-line items list must appear
    const purchaseItems = page.locator('ul[aria-label="Purchase items"]');
    await expect(purchaseItems).toBeVisible({ timeout: 5000 });

    // Assert UNCONDITIONALLY that a real <img> with a signed URL renders on the line row.
    // Same guarantee as PHOTO-S2: ProductThumbnail(url=signedUrl) → <img> with src.
    // No if/else: a missing or placeholder img is a test failure.
    const firstRow = purchaseItems.locator('li').first();
    await expect(firstRow).toBeVisible({ timeout: 5000 });

    const thumbnailImg = firstRow.locator('img');
    await expect(thumbnailImg).toBeVisible({ timeout: 5000 });
    const src = await thumbnailImg.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toBe('');
  });
});
