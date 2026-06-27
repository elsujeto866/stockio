/**
 * Products E2E tests — cost price and margin display lifecycle.
 *
 * Scenarios covered:
 *   COST-S1: create a product with cost price → catalog shows unit margin amount and %
 *   COST-S2: edit product → clear cost price → catalog shows "—" for margin
 *
 * Uses the throwaway test tenant provisioned by e2e/global-setup.ts.
 * Cleanup: global-teardown deletes the entire throwaway tenant → all rows cascade.
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Credentials shape
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
// Unique names per run
// ---------------------------------------------------------------------------
const SUFFIX = Date.now().toString(36);
const PRODUCT_NAME = `E2E Cost Product ${SUFFIX}`;
const UNIT_PRICE = 10;
const COST_PRICE = 6;
// Expected unit margin: 10 - 6 = 4.00, percent = 40.0%

// ---------------------------------------------------------------------------
// Shared login helper
// ---------------------------------------------------------------------------
async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

// ---------------------------------------------------------------------------
// COST-S1: create product with cost → catalog shows margin
// COST-S2: edit product → clear cost → "—" shown
// ---------------------------------------------------------------------------
test.describe('Cost price and margin display', () => {
  test('COST-S1: create product with cost price → margin visible in catalog', async ({
    page,
  }) => {
    await login(page);

    // Navigate to create product form
    await page.goto('/products/new');

    // Fill in the product form
    await page.fill('[name=nombre]', PRODUCT_NAME);
    await page.fill('[name=precio_unitario]', String(UNIT_PRICE));
    await page.fill('[name=stock_actual]', '100');
    await page.fill('[name=stock_minimo]', '5');
    await page.fill('[name=cost_price]', String(COST_PRICE));

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to products catalog
    await expect(page).toHaveURL('/products');

    // Find the product card and check margin
    const productCard = page.locator('text=' + PRODUCT_NAME).locator('..').locator('..');
    await expect(productCard.getByText(/\$4\.00/)).toBeVisible();
    await expect(productCard.getByText(/40\.0%/)).toBeVisible();
  });

  test('COST-S2: clear cost price → margin shows "—"', async ({ page }) => {
    await login(page);

    // Navigate to catalog and find the product's edit link
    await page.goto('/products');

    // Find the product and click edit
    const productRow = page.locator(`text=${PRODUCT_NAME}`).first();
    await expect(productRow).toBeVisible();

    // Click edit for this product
    const card = productRow.locator('..').locator('..');
    await card.getByRole('link', { name: /editar/i }).click();

    // Clear the cost_price field
    await page.fill('[name=cost_price]', '');

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to /products
    await expect(page).toHaveURL('/products');

    // Margin should now show "—" in the unit margin area
    const updatedCard = page.locator(`text=${PRODUCT_NAME}`).first().locator('..').locator('..');
    await expect(updatedCard.getByTestId('unit-margin-null')).toBeVisible();
  });
});
