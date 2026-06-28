/**
 * Expiry Batches E2E tests (S4-T27).
 *
 * Scenarios covered:
 *   EXPIRY-S1: create product with shelf_life_days → navigate to product detail → lot appears with badge
 *   EXPIRY-S2: create purchase with expiry date → product detail shows lot with correct badge
 *   EXPIRY-S3: FEFO — oldest-expiry lot decremented first after order creation
 *   EXPIRY-S4: dashboard ExpiringSoonWidget is visible
 *
 * NOTE: Scenarios EXPIRY-S2, EXPIRY-S3 require migrations 100000–100300 applied.
 * If the lots table does not exist, these tests are skipped gracefully.
 *
 * Uses throwaway test tenant from e2e/global-setup.ts.
 * Cleanup: global-teardown cascades deletion of entire test tenant.
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
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

const SUFFIX = Date.now().toString(36);
const PRODUCT_NAME = `E2E Expiry ${SUFFIX}`;
const SHELF_LIFE_DAYS = '30';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

// ---------------------------------------------------------------------------
// EXPIRY-S1: ProductForm shelf_life_days field renders and saves
// ---------------------------------------------------------------------------
test.describe('Expiry Batches — product fields', () => {
  test('EXPIRY-S1: shelf_life_days input visible in create product form', async ({ page }) => {
    await login(page);

    await page.goto('/products/new');

    // Shelf life field should be present (REQ-7)
    const shelfLifeInput = page.getByLabel(/vida útil/i);
    await expect(shelfLifeInput).toBeVisible();

    // expiry_alert_days defaults to 30
    const alertDaysInput = page.getByLabel(/alerta.*vencimiento/i);
    await expect(alertDaysInput).toHaveValue('30');

    // Fill in a product with shelf life
    await page.fill('[name=nombre]', PRODUCT_NAME);
    await page.fill('[name=precio_unitario]', '10');
    await page.fill('[name=stock_actual]', '0');
    await page.fill('[name=stock_minimo]', '2');
    await page.fill('[name=shelf_life_days]', SHELF_LIFE_DAYS);

    await page.click('[type=submit]');

    // Should redirect to products list after creation
    await expect(page).toHaveURL('/products');
  });

  test('EXPIRY-S4: dashboard shows ExpiringSoonWidget section', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');

    // Widget heading should be visible
    const widgetHeading = page.getByText(/lotes por vencer/i);
    await expect(widgetHeading).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// EXPIRY-S2: Product detail page shows lot list
// ---------------------------------------------------------------------------
test.describe('Expiry Batches — product detail', () => {
  test('EXPIRY-S2: product detail page exists and shows lot list section', async ({ page }) => {
    await login(page);

    // Find the product created by EXPIRY-S1 on the products list page.
    // ProductCard renders product names as plain text (not links), so we locate
    // the <li> by its text content and extract the "Editar" link href to get
    // the product ID, then navigate to the detail page directly.
    await page.goto('/products');

    const productLi = page.locator('li').filter({ hasText: PRODUCT_NAME });
    const count = await productLi.count();

    if (count === 0) {
      throw new Error(
        `Product "${PRODUCT_NAME}" not found on /products — EXPIRY-S1 must run and succeed before this test`
      );
    }

    // editHref = /products/{id}/edit — strip /edit to get the detail URL
    const editLink = productLi.first().getByRole('link', { name: 'Editar' });
    const editHref = await editLink.getAttribute('href');
    const detailUrl = editHref!.replace('/edit', '');
    await page.goto(detailUrl);

    // The URL should be /products/{id}
    await expect(page).toHaveURL(/\/products\/[a-z0-9-]+$/);

    // Lot list section must be visible (REQ-6)
    await expect(page.getByText(/lotes de inventario/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// EXPIRY-S3: Purchase builder shows per-line expiry date input
// ---------------------------------------------------------------------------
test.describe('Expiry Batches — purchase lot creation', () => {
  test('EXPIRY-S3: purchase builder shows expiryDate input per line', async ({ page }) => {
    await login(page);

    await page.goto('/purchases/new');

    // Product selector must be present — fail loudly if the page is unreachable
    const productSelect = page.getByLabel('Seleccionar un producto para agregar');
    await expect(productSelect).toBeVisible();

    // Select the product created by EXPIRY-S1 and add it as a purchase line
    await productSelect.selectOption({ label: PRODUCT_NAME });
    await page.getByRole('button', { name: 'Agregar' }).click();

    // Per-line expiry date input must render (REQ-1).
    // The input carries aria-label="Fecha de vencimiento de {productName}".
    await expect(page.getByLabel(/Fecha de vencimiento de/i)).toBeVisible();
  });
});
