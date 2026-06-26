/**
 * Stores E2E tests — full store lifecycle.
 *
 * Uses the throwaway test tenant+user provisioned by e2e/global-setup.ts.
 * Tests run against the live dev server (npm run dev) on http://localhost:3000.
 *
 * Journey:
 *   1. Log in
 *   2. Create a store
 *   3. See it in the stores list
 *   4. Edit store name → persists
 *   5. Soft-delete → store absent from list
 *
 * Cleanup: the global-teardown.ts deletes the entire throwaway tenant,
 * which cascades to all stores created here. No per-test cleanup needed.
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

// Unique name so parallel runs don't collide on the store list.
const STORE_NAME = `E2E Store ${Date.now()}`;

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

test.describe('Stores management', () => {
  test('full store lifecycle: create → list → edit → delete', async ({ page }) => {
    // ── 1. Log in ──────────────────────────────────────────────────────────
    await login(page);

    // ── 2. Create a store ─────────────────────────────────────────────────
    await page.goto('/stores/new');
    await page.fill('[name=nombre]', STORE_NAME);
    await page.fill('[name=contacto]', 'Test Contact');
    await page.click('[type=submit]');

    // ── 3. Lands on /stores and the new store is listed ───────────────────
    await expect(page).toHaveURL('/stores');
    await expect(page.getByText(STORE_NAME)).toBeVisible();

    // ── 4. Edit store name ────────────────────────────────────────────────
    const editedName = `${STORE_NAME} (edited)`;
    const card = page.locator('li', { has: page.getByText(STORE_NAME) }).first();
    await card.getByRole('link', { name: /^editar$/i }).click();

    await page.fill('[name=nombre]', editedName);
    await page.click('[type=submit]');

    // Name change persists in the list.
    await expect(page).toHaveURL('/stores');
    await expect(page.getByText(editedName)).toBeVisible();

    // ── 5. Soft-delete → absent from list ─────────────────────────────────
    const card2 = page.locator('li', { has: page.getByText(editedName) }).first();
    await card2.getByRole('button', { name: /eliminar/i }).click();

    // Store should no longer appear in the list.
    await expect(page).toHaveURL('/stores');
    await expect(page.getByText(editedName)).not.toBeVisible();
  });

  test('shows validation error when nombre is empty', async ({ page }) => {
    await login(page);
    await page.goto('/stores/new');

    // Submit without nombre
    await page.click('[type=submit]');

    // Should stay on /stores/new and show an error
    await expect(page).toHaveURL('/stores/new');
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
