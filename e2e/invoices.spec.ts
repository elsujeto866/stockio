/**
 * Invoices E2E tests — full invoice lifecycle.
 *
 * Uses the throwaway test tenant+user provisioned by e2e/global-setup.ts.
 * Pre-seeds a store and two products via the Supabase admin client (same
 * pattern as global-setup) so tests are fast and deterministic.
 *
 * Scenarios:
 *   S1: create order → from order detail Generate invoice → comprobante shows
 *       Invoice #, store name, frozen line prices + total → toggle paid →
 *       persists → back on order detail shows 'View invoice' link
 *   S2: cancelled order does NOT show Generate invoice button
 *
 * Cleanup: global-teardown deletes the entire throwaway tenant, which cascades
 * to all rows created here. No per-test cleanup needed.
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Credentials shape — includes tenantId written by global-setup
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
// WebSocket stub — same as global-setup (suppresses realtime on Node 20)
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
// Env loader — re-reads .env.local in the test process (mirrors global-setup)
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
// Admin client factory (uses SUPABASE_SECRET_KEY to bypass RLS)
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
// Unique names so parallel runs and retries don't collide
// ---------------------------------------------------------------------------
const SUFFIX = Date.now().toString(36);
const STORE_NAME = `E2E Invoice Store ${SUFFIX}`;
const PRODUCT_A_NAME = `E2E InvWidget ${SUFFIX}`;
const PRODUCT_B_NAME = `E2E InvGadget ${SUFFIX}`;

// Shared seed IDs, set in beforeAll
let seededStoreId: string;
let seededProductAId: string;
let seededProductBId: string;

// ---------------------------------------------------------------------------
// Seed: one store + two products for the throwaway test tenant
// ---------------------------------------------------------------------------
test.beforeAll(async () => {
  const admin = makeAdmin();
  const tenantId = creds.tenantId;

  // Store
  const { data: store, error: storeErr } = await admin
    .from('stores')
    .insert({ nombre: STORE_NAME, tenant_id: tenantId, activo: true })
    .select('id')
    .single();
  if (storeErr) throw new Error(`[E2E invoices] Seed store: ${storeErr.message}`);
  seededStoreId = (store as { id: string }).id;

  // Product A — $10.00, stock 50
  const { data: pA, error: pAErr } = await admin
    .from('products')
    .insert({
      nombre: PRODUCT_A_NAME,
      precio_unitario: 10.00,
      stock_actual: 50,
      stock_minimo: 5,
      tenant_id: tenantId,
      activo: true,
    })
    .select('id')
    .single();
  if (pAErr) throw new Error(`[E2E invoices] Seed product A: ${pAErr.message}`);
  seededProductAId = (pA as { id: string }).id;

  // Product B — $25.00, stock 10
  const { data: pB, error: pBErr } = await admin
    .from('products')
    .insert({
      nombre: PRODUCT_B_NAME,
      precio_unitario: 25.00,
      stock_actual: 10,
      stock_minimo: 2,
      tenant_id: tenantId,
      activo: true,
    })
    .select('id')
    .single();
  if (pBErr) throw new Error(`[E2E invoices] Seed product B: ${pBErr.message}`);
  seededProductBId = (pB as { id: string }).id;

  console.log(
    `[E2E invoices] Seeded store ${seededStoreId}, ` +
    `product A ${seededProductAId}, product B ${seededProductBId}`
  );
});

// ---------------------------------------------------------------------------
// Shared helper: log in
// ---------------------------------------------------------------------------
async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

// ---------------------------------------------------------------------------
// Shared helper: create an order via UI and return the order URL
// ---------------------------------------------------------------------------
async function createOrder(
  page: Page,
  options: {
    productId: string;
    productName: string;
    cantidad?: number;
  }[]
): Promise<string> {
  await page.goto('/orders/new');
  await page.selectOption('select[name="storeId"]', seededStoreId);

  for (const { productId, productName, cantidad = 1 } of options) {
    await page.selectOption('select[aria-label="Seleccionar un producto para agregar"]', productId);
    await page.click('button:has-text("Agregar")');

    // Increment quantity beyond the default (1) if needed
    for (let i = 1; i < cantidad; i++) {
      await page.click(`button[aria-label="Aumentar cantidad de ${productName}"]`);
    }
  }

  await page.click('button[type="submit"]:has-text("Crear pedido")');
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);

  return page.url();
}

// ---------------------------------------------------------------------------
// S1 — create order → Generate invoice → comprobante → toggle paid → order shows View invoice
// ---------------------------------------------------------------------------
test.describe('Invoices management', () => {
  test('S1: create order → Generate invoice → comprobante shows frozen prices → toggle paid → order shows View invoice', async ({
    page,
  }) => {
    await login(page);

    // Create a 2-line order: 2×Widget ($10) + 1×Gadget ($25) = $45
    const orderUrl = await createOrder(page, [
      { productId: seededProductAId, productName: PRODUCT_A_NAME, cantidad: 2 },
      { productId: seededProductBId, productName: PRODUCT_B_NAME, cantidad: 1 },
    ]);

    // Order detail shows Generar factura button (no invoice yet)
    await expect(
      page.getByRole('button', { name: /generar factura/i })
    ).toBeVisible();

    // Generate the invoice
    await page.click('button:has-text("Generar factura")');

    // Should land on /invoices/<uuid>
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);

    // Comprobante header — Factura # and store name.
    // Use h1 locator to avoid strict-mode violation with InvoiceDetail's h2.
    await expect(page.locator('h1', { hasText: /Factura #/ })).toBeVisible();
    await expect(page.getByText(STORE_NAME)).toBeVisible();

    // Product names confirm both line items are present
    await expect(page.getByText(PRODUCT_A_NAME)).toBeVisible();
    await expect(page.getByText(PRODUCT_B_NAME)).toBeVisible();

    // Widget precio $10.00 is unique (its subtotal is $20.00)
    await expect(page.getByText('$10.00')).toBeVisible();

    // Gadget precio $25.00 — scope to its <li> because precio === subtotal
    // when cantidad === 1 (same disambiguation pattern as orders.spec.ts)
    await expect(
      page.locator('li', { has: page.getByText(PRODUCT_B_NAME) }).getByText('$25.00').first()
    ).toBeVisible();

    // Total: 2×10 + 1×25 = $45.00
    await expect(page.getByText('$45.00')).toBeVisible();

    // Payment badge is Sin pagar (create_invoice sets estado_pago = null)
    // Use positive assertion — "not /Pagado/i" would wrongly match "Sin pagar".
    await expect(page.getByRole('status')).toHaveText(/Sin pagar/i);

    // Toggle payment to paid
    await page.click('button:has-text("Marcar como pagada")');

    // Payment badge is now Pagado
    await expect(page.getByRole('status')).toHaveText(/Pagado/i);

    // Navigate back to the order detail
    await page.goto(orderUrl);

    // Order detail now shows "Ver factura →" link instead of Generate button
    await expect(
      page.getByRole('link', { name: /ver factura/i })
    ).toBeVisible();
    await expect(
      page.locator('button:has-text("Generar factura")')
    ).not.toBeVisible();

    // Follow the View invoice link
    await page.click('a:has-text("Ver factura")');
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);

    // Invoice is still marked Pagado after navigation
    await expect(page.getByRole('status')).toHaveText(/Pagado/i);
  });

  // ---------------------------------------------------------------------------
  // S2 — cancelled order shows no Generate invoice button
  // ---------------------------------------------------------------------------
  test('S2: cancelled order does not show Generate invoice button', async ({ page }) => {
    await login(page);

    // Create an order with product A (cantidad 1)
    const orderUrl = await createOrder(page, [
      { productId: seededProductAId, productName: PRODUCT_A_NAME, cantidad: 1 },
    ]);

    // The Generar factura button IS present before cancel
    await expect(
      page.getByRole('button', { name: /generar factura/i })
    ).toBeVisible();

    // Cancel the order
    await page.click('button:has-text("Cancelar pedido")');
    await expect(page.getByRole('status')).toHaveText(/Cancelado/i);

    // Generar factura button is now absent
    await expect(
      page.locator('button:has-text("Generar factura")')
    ).not.toBeVisible();

    // Refresh the page and verify the button is still absent
    await page.goto(orderUrl);
    await expect(
      page.locator('button:has-text("Generar factura")')
    ).not.toBeVisible();
  });
});
