/**
 * Auth E2E smoke tests — PENDING REAL BACKEND
 *
 * These tests require a live Supabase instance:
 *   - Either a local Docker stack: `supabase start` (WU3)
 *   - Or a cloud project with .env.local populated
 *
 * Until WU3 (schema migration) lands and credentials are available in CI,
 * run these manually against a local Supabase stack:
 *   npx playwright test e2e/auth.spec.ts
 *
 * Do NOT run in the standard `npm test` pipeline yet — no DB, no server.
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication flows', () => {
  test.skip(
    process.env.SUPABASE_E2E !== 'true',
    'Requires SUPABASE_E2E=true and a live Supabase instance (WU3+)'
  );

  test('valid credentials → redirects to /dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name=email]', process.env.E2E_USER_EMAIL ?? '');
    await page.fill('[name=password]', process.env.E2E_USER_PASSWORD ?? '');
    await page.click('[type=submit]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('invalid credentials → shows inline error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name=email]', 'bad@example.com');
    await page.fill('[name=password]', 'wrongpassword');
    await page.click('[type=submit]');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('sign out → redirects to /login', async ({ page }) => {
    // Assumes prior test left an authenticated session, or re-login here.
    await page.goto('/dashboard');
    await page.click('[type=submit]'); // sign-out button is a form submit
    await expect(page).toHaveURL('/login');
  });

  test('unauthenticated /dashboard → redirects to /login', async ({ page }) => {
    // Clear cookies to ensure no session
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });
});
