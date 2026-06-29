/**
 * Product Photos E2E tests — PP-T20 / PP-T28.
 *
 * REQ-1 (S1-1), REQ-4 (S4-1), REQ-5 (S5-1, S5-3).
 *
 * Scenarios:
 *   PHOTO-S1: create product with photo → thumbnail visible in catalog
 *   PHOTO-S2: add photo product to order → thumbnail on order line row
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

// ---------------------------------------------------------------------------
// PHOTO-S1: create product with photo → thumbnail appears in catalog
// ---------------------------------------------------------------------------
test.describe('Product Photos', () => {
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

  test('PHOTO-S2: add photo product to order → thumbnail on order line row (S5-3)', async ({ page }) => {
    await login(page);

    // Navigate to new order
    await page.goto('/orders/new');

    // Select the product we just created from the product selector
    const productSelect = page.locator('select[aria-label="Seleccionar un producto para agregar"]');
    await expect(productSelect).toBeVisible({ timeout: 10000 });

    // Select our product
    await productSelect.selectOption({ label: PRODUCT_NAME });

    // Click "Agregar" to add the line item
    await page.click('button:has-text("Agregar")');

    // The added-line row should contain an <img> (thumbnail)
    const lineItems = page.locator('ul[aria-label="Order items"]');
    await expect(lineItems).toBeVisible({ timeout: 5000 });

    // Assert that at least one <img> exists in the line items (thumbnail)
    const lineImg = lineItems.locator('img').first();
    await expect(lineImg).toBeVisible({ timeout: 10000 });

    const src = await lineImg.getAttribute('src');
    expect(src).toBeTruthy();
  });
});
