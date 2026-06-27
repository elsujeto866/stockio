/**
 * Suppliers E2E tests — full supplier lifecycle.
 *
 * Uses the throwaway test tenant+user provisioned by e2e/global-setup.ts.
 * Tests run against the live dev server (npm run dev) on http://localhost:3000.
 *
 * Journey:
 *   1. Log in
 *   2. Create a supplier (REQ-S1)
 *   3. See it in the suppliers list
 *   4. Edit supplier name → persists (REQ-S3)
 *   5. Deactivate → supplier absent from list (REQ-S4)
 *   6. No hard-delete button visible anywhere in UI (REQ-S4)
 *
 * Cleanup: the global-teardown.ts deletes the entire throwaway tenant,
 * which cascades to all suppliers created here. No per-test cleanup needed.
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

// Unique name so parallel runs don't collide on the supplier list.
const SUPPLIER_NAME = `E2E Proveedor ${Date.now()}`;

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Suppliers management', () => {
  test('Scenario 1 (REQ-S1): create supplier → appears in list', async ({ page }) => {
    // ── 1. Log in ──────────────────────────────────────────────────────────
    await login(page);

    // ── 2. Navigate to new supplier form ──────────────────────────────────
    await page.goto('/suppliers/new');
    await page.fill('[name=nombre]', SUPPLIER_NAME);
    await page.fill('[name=contacto]', 'Test Contact');
    await page.click('[type=submit]');

    // ── 3. Redirected to /suppliers; new supplier listed ──────────────────
    await expect(page).toHaveURL('/suppliers');
    await expect(page.getByText(SUPPLIER_NAME)).toBeVisible();
  });

  test('Scenario 2 (REQ-S3): edit supplier name → persists', async ({ page }) => {
    await login(page);
    await page.goto('/suppliers');

    const editedName = `${SUPPLIER_NAME} (editado)`;
    const card = page.locator('li', { has: page.getByText(SUPPLIER_NAME) }).first();
    await card.getByRole('link', { name: /^editar$/i }).click();

    await page.fill('[name=nombre]', editedName);
    await page.click('[type=submit]');

    // Name change persists in the list.
    await expect(page).toHaveURL('/suppliers');
    await expect(page.getByText(editedName)).toBeVisible();
  });

  test('Scenario 3 (REQ-S4): deactivate → supplier disappears from list; no Delete button visible', async ({ page }) => {
    await login(page);
    await page.goto('/suppliers');

    // Find the edited supplier card and deactivate it
    const editedName = `${SUPPLIER_NAME} (editado)`;
    const card = page.locator('li', { has: page.getByText(editedName) }).first();
    await card.getByRole('button', { name: /desactivar/i }).click();

    // Supplier should no longer appear in the list
    await expect(page).toHaveURL('/suppliers');
    await expect(page.getByText(editedName)).not.toBeVisible();

    // No "Eliminar" / "Delete" button should be visible anywhere
    await expect(page.getByRole('button', { name: /eliminar/i })).not.toBeVisible();
  });

  test('shows validation error when nombre is empty', async ({ page }) => {
    await login(page);
    await page.goto('/suppliers/new');

    // Submit without nombre
    await page.click('[type=submit]');

    // Should stay on /suppliers/new and show a validation error
    await expect(page).toHaveURL('/suppliers/new');
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
