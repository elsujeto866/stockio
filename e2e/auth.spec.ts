/**
 * Auth E2E smoke tests.
 *
 * Credentials for the throwaway test tenant+user are written by
 * e2e/global-setup.ts before these tests run, and deleted by
 * e2e/global-teardown.ts after they finish.
 *
 * Run:  npm run test:e2e
 *
 * Prerequisites:
 *   - npx playwright install chromium (one-time)
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *     and SUPABASE_SECRET_KEY (needed by global-setup/teardown)
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

interface E2ECredentials {
  email: string;
  password: string;
}

// Credentials file is created by global-setup.ts before workers start.
const creds: E2ECredentials = JSON.parse(
  readFileSync(join(process.cwd(), "e2e", ".test-credentials.json"), "utf-8")
);

test.describe("Authentication flows", () => {
  test("unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });

  test("valid credentials land on /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill("[name=email]", creds.email);
    await page.fill("[name=password]", creds.password);
    await page.click("[type=submit]");
    await expect(page).toHaveURL("/dashboard");
  });

  test("invalid credentials show an inline error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("[name=email]", "nobody@example.com");
    await page.fill("[name=password]", "wrongpassword");
    await page.click("[type=submit]");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("sign out returns to /login and blocks protected routes", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill("[name=email]", creds.email);
    await page.fill("[name=password]", creds.password);
    await page.click("[type=submit]");
    await expect(page).toHaveURL("/dashboard");

    // Sign out via the global nav button (the only "Cerrar sesión" control)
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL("/login");

    // Confirm protected route is now blocked
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });
});
