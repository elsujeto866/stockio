/**
 * Inventory E2E tests — full product lifecycle.
 *
 * Uses the throwaway test tenant+user provisioned by e2e/global-setup.ts.
 * Tests run against the live dev server (npm run dev) on http://localhost:3000.
 *
 * Journey:
 *   1. Log in
 *   2. Create a product with stock_actual < stock_minimo
 *   3. See it in the products list
 *   4. LowStockBadge is visible (R6)
 *   5. Adjust stock up → stock_actual >= stock_minimo
 *   6. LowStockBadge disappears
 *   7. Edit product name → persists
 *   8. Soft-delete → product absent from list
 *
 * Cleanup: the global-teardown.ts deletes the entire throwaway tenant,
 * which cascades to all products created here. No per-test cleanup needed.
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

interface E2ECredentials {
  email: string;
  password: string;
}

const creds: E2ECredentials = JSON.parse(
  readFileSync(join(process.cwd(), 'e2e', '.test-credentials.json'), 'utf-8')
);

// Unique name so parallel runs don't collide on the product list.
const PRODUCT_NAME = `E2E Olive Oil ${Date.now()}`;

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Inventory management', () => {
  test('full product lifecycle: create → low-stock → adjust → edit → delete', async ({
    page,
  }) => {
    // ── 1. Log in ──────────────────────────────────────────────────────────
    await login(page);

    // ── 2. Create a product with stock_actual (2) < stock_minimo (10) ─────
    await page.goto('/products/new');
    await page.fill('[name=nombre]', PRODUCT_NAME);
    await page.fill('[name=precio_unitario]', '9.99');
    await page.fill('[name=stock_actual]', '2');
    await page.fill('[name=stock_minimo]', '10');
    await page.click('[type=submit]');

    // ── 3. Lands on /products and the new product is listed ────────────────
    await expect(page).toHaveURL('/products');
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible();

    // ── 4. LowStockBadge is visible (stock 2 < min 10) ────────────────────
    // Find the card that contains our product name, then check its badge.
    const card = page.locator('li', { has: page.getByText(PRODUCT_NAME) }).first();
    await expect(card.getByRole('status')).toBeVisible();

    // ── 5. Adjust stock up by 10 (total becomes 12 ≥ minimo 10) ───────────
    await card.getByRole('link', { name: /ajustar stock/i }).click();

    // Fill the delta input directly (overrides the default 0).
    await page.fill('[name=delta]', '10');
    await page.click('[type=submit]');

    // ── 6. Back on /products — badge should be gone ────────────────────────
    await expect(page).toHaveURL('/products');
    const card2 = page.locator('li', { has: page.getByText(PRODUCT_NAME) }).first();
    await expect(card2.getByRole('status')).not.toBeVisible();

    // ── 7. Edit product name ───────────────────────────────────────────────
    const editedName = `${PRODUCT_NAME} (edited)`;
    await card2.getByRole('link', { name: /^editar$/i }).click();

    await page.fill('[name=nombre]', editedName);
    await page.click('[type=submit]');

    // Name change persists in the list.
    await expect(page).toHaveURL('/products');
    await expect(page.getByText(editedName)).toBeVisible();

    // ── 8. Soft-delete → absent from list ─────────────────────────────────
    const card3 = page.locator('li', { has: page.getByText(editedName) }).first();
    await card3.getByRole('button', { name: /eliminar/i }).click();

    // Product should no longer appear in the list.
    await expect(page).toHaveURL('/products');
    await expect(page.getByText(editedName)).not.toBeVisible();
  });

  test('shows validation error when nombre is empty', async ({ page }) => {
    await login(page);
    await page.goto('/products/new');

    // Submit without nombre
    await page.fill('[name=precio_unitario]', '5');
    await page.fill('[name=stock_actual]', '1');
    await page.fill('[name=stock_minimo]', '0');
    await page.click('[type=submit]');

    // Should stay on /products/new and show an error
    await expect(page).toHaveURL('/products/new');
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
