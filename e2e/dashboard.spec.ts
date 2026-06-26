/**
 * Dashboard E2E tests — operational snapshot.
 *
 * Uses the throwaway test tenant+user provisioned by e2e/global-setup.ts.
 * Seeds a low-stock product and an order via the Supabase admin client.
 *
 * Scenarios:
 *   - Login → /dashboard → LowStockWidget shows the seeded low-stock product
 *   - RecentOrdersWidget shows the seeded order
 *   - PeriodTotalsWidget is visible (amount >= $0.00)
 *
 * Cleanup: global-teardown deletes the entire throwaway tenant, which cascades.
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
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
// WebSocket stub
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
// Env loader
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
// Admin client factory
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
// Unique names per run
// ---------------------------------------------------------------------------
const SUFFIX = Date.now().toString(36);
const LOW_STOCK_PRODUCT_NAME = `E2E LowStock ${SUFFIX}`;
const STORE_NAME = `E2E Dashboard Store ${SUFFIX}`;

// Shared IDs set in beforeAll
let seededStoreId: string;
let seededProductId: string;
let seededOrderId: string;

// ---------------------------------------------------------------------------
// Seed: one store + one low-stock product + one order
// ---------------------------------------------------------------------------
test.beforeAll(async () => {
  const admin = makeAdmin();
  const tenantId = creds.tenantId;
  const today = new Date().toISOString().slice(0, 10);

  // Store
  const { data: store, error: storeErr } = await admin
    .from('stores')
    .insert({ nombre: STORE_NAME, tenant_id: tenantId, activo: true })
    .select('id')
    .single();
  if (storeErr) throw new Error(`[E2E dashboard] Seed store: ${storeErr.message}`);
  seededStoreId = (store as { id: string }).id;

  // Low-stock product: stock_actual (1) < stock_minimo (10)
  const { data: product, error: productErr } = await admin
    .from('products')
    .insert({
      nombre: LOW_STOCK_PRODUCT_NAME,
      precio_unitario: 15.00,
      stock_actual: 1,
      stock_minimo: 10,
      tenant_id: tenantId,
      activo: true,
    })
    .select('id')
    .single();
  if (productErr) throw new Error(`[E2E dashboard] Seed product: ${productErr.message}`);
  seededProductId = (product as { id: string }).id;

  // Order for today (within current period)
  // Note: admin INSERT bypasses create_order RPC, so total may be null.
  // The E2E assertion uses presence-based check for the period widget.
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      tenant_id: tenantId,
      store_id: seededStoreId,
      estado: 'pendiente',
      fecha: today,
    })
    .select('id')
    .single();
  if (orderErr) throw new Error(`[E2E dashboard] Seed order: ${orderErr.message}`);
  seededOrderId = (order as { id: string }).id;

  console.log(
    `[E2E dashboard] Seeded store ${seededStoreId}, product ${seededProductId} (${LOW_STOCK_PRODUCT_NAME}), order ${seededOrderId}`
  );
});

// ---------------------------------------------------------------------------
// Shared helper: log in and navigate to dashboard
// ---------------------------------------------------------------------------
async function loginAndGoToDashboard(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe('Dashboard', () => {
  test('low-stock product appears in LowStockWidget', async ({ page }) => {
    await loginAndGoToDashboard(page);

    // The low-stock product name must appear in the dashboard
    await expect(page.getByText(LOW_STOCK_PRODUCT_NAME)).toBeVisible();
  });

  test('seeded order appears in RecentOrdersWidget', async ({ page }) => {
    await loginAndGoToDashboard(page);

    // The store name appears in the recent orders list
    await expect(page.getByText(STORE_NAME)).toBeVisible();
  });

  test('PeriodTotalsWidget is visible with period label', async ({ page }) => {
    await loginAndGoToDashboard(page);

    // Period widget shows "Totales del mes" heading
    await expect(page.getByText('Totales del mes')).toBeVisible();

    // The month label (e.g. "junio 2026") is visible
    const now = new Date();
    const monthNames = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    const expectedLabel = `${monthNames[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
    await expect(page.getByText(expectedLabel)).toBeVisible();

    // Sales total is present (may be $0.00 if order total is null from admin insert)
    // Assert presence: any element containing a dollar sign followed by digits
    const salesElements = page.locator('text=/\\$\\d+[,\\.]\\d{2}/');
    await expect(salesElements.first()).toBeVisible();
  });

  test('seeded product links to /products from LowStockWidget', async ({ page }) => {
    await loginAndGoToDashboard(page);

    // Click the low-stock product link
    const productLink = page.getByRole('link', { name: LOW_STOCK_PRODUCT_NAME });
    await expect(productLink).toBeVisible();
    await productLink.click();
    await expect(page).toHaveURL('/products');
  });

  test('order in RecentOrdersWidget links to /orders/[id]', async ({ page }) => {
    await loginAndGoToDashboard(page);

    // Find and click the link pointing to the seeded order detail page
    const orderLink = page.locator(`a[href="/orders/${seededOrderId}"]`);
    await expect(orderLink).toBeVisible();
  });
});
