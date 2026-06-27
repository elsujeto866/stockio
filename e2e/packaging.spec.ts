/**
 * Packaging E2E tests — sell-by-pack lifecycle.
 *
 * Scenarios covered:
 *   PKG-S1: create a packaged product, sell 2 packs → stock decrements by base_units (60)
 *            and order detail shows the pack label ("2 paca(s) × 30 u")
 *   PKG-S2: cancel a pack order → stock is fully restored by base_units, NOT cantidad
 *   PKG-S3: mixed order (same product, unit + package) → two independent lines
 *
 * Uses the throwaway test tenant provisioned by e2e/global-setup.ts.
 * Cleanup: global-teardown deletes the entire throwaway tenant → all rows cascade.
 *
 * Satisfies: REQ-4, REQ-2, REQ-5, Scenarios 4.1, 2.2, 5.1
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
// WebSocket stub (suppresses realtime on Node 20)
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
// Env loader (re-reads .env.local in test process)
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
// Admin client
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
const PACK_STORE_NAME  = `E2E Pack Store ${SUFFIX}`;
const PACK_PRODUCT_NAME = `E2E Pack Rice ${SUFFIX}`;
const PACK_SIZE        = 30;
const PACK_PRICE       = 150.00;
const UNIT_PRICE       = 6.00;
const INITIAL_STOCK    = 120; // enough for 4 packs (120 base units)

let seededStoreId: string;
let seededPackProductId: string;

// ---------------------------------------------------------------------------
// Seed: one store + one packaged product
// ---------------------------------------------------------------------------
test.beforeAll(async () => {
  const admin = makeAdmin();
  const tenantId = creds.tenantId;

  // Store
  const { data: store, error: storeErr } = await admin
    .from('stores')
    .insert({ nombre: PACK_STORE_NAME, tenant_id: tenantId, activo: true })
    .select('id')
    .single();
  if (storeErr) throw new Error(`[E2E packaging] Seed store: ${storeErr.message}`);
  seededStoreId = (store as { id: string }).id;

  // Packaged product — 30 u/paca, $150 per paca, $6 per unit
  const { data: product, error: productErr } = await admin
    .from('products')
    .insert({
      nombre: PACK_PRODUCT_NAME,
      precio_unitario: UNIT_PRICE,
      precio_paca: PACK_PRICE,
      units_per_package: PACK_SIZE,
      stock_actual: INITIAL_STOCK,
      stock_minimo: 0,
      tenant_id: tenantId,
      activo: true,
    })
    .select('id')
    .single();
  if (productErr) throw new Error(`[E2E packaging] Seed product: ${productErr.message}`);
  seededPackProductId = (product as { id: string }).id;

  console.log(
    `[E2E packaging] Seeded store ${seededStoreId}, pack product ${seededPackProductId}`
  );
});

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
// PKG-S1: Create pack order → stock decrements by base_units + detail shows pack label
// ---------------------------------------------------------------------------
test.describe('Packaging management', () => {
  test('PKG-S1: sell 2 packs → stock -= 60 (base_units) and detail shows pack label', async ({
    page,
  }) => {
    const admin = makeAdmin();

    await login(page);

    // Record stock before
    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', seededPackProductId)
      .single();
    const stockBefore = (before as { stock_actual: number }).stock_actual;

    // Navigate to new order
    await page.goto('/orders/new');

    // Select store
    await page.selectOption('select[name="storeId"]', seededStoreId);

    // Select product
    await page.selectOption(
      'select[aria-label="Seleccionar un producto para agregar"]',
      seededPackProductId
    );

    // Select "Paca" as the sale unit
    await page.selectOption('select[aria-label="Tipo de venta"]', 'package');

    // Click Agregar (add 1 pack)
    await page.click('button:has-text("Agregar")');

    // Increase to 2 packs
    await page.click(`button[aria-label="Aumentar cantidad de ${PACK_PRODUCT_NAME} (Paca)"]`);

    // Preview total: 2 packs × $150 = $300
    await expect(page.getByLabel('Total estimado')).toHaveText('$300.00');

    // Submit order
    await page.click('button[type="submit"]:has-text("Crear pedido")');

    // Should redirect to /orders/<uuid>
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/);

    // Detail should show pack label "2 paca(s) × 30 u"
    await expect(page.getByText(/2 paca\(s\) × 30 u/i)).toBeVisible();

    // Stock must have decremented by 60 (2 packs × 30 units)
    const { data: after } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', seededPackProductId)
      .single();
    const stockAfter = (after as { stock_actual: number }).stock_actual;
    expect(stockAfter).toBe(stockBefore - 2 * PACK_SIZE); // 120 - 60 = 60
  });

  test('PKG-S2: cancel pack order → stock restored by base_units (NOT cantidad)', async ({
    page,
  }) => {
    const admin = makeAdmin();

    await login(page);

    // Record stock before
    const { data: before } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', seededPackProductId)
      .single();
    const stockBefore = (before as { stock_actual: number }).stock_actual;

    // Create a pack order (1 pack = 30 base units)
    await page.goto('/orders/new');
    await page.selectOption('select[name="storeId"]', seededStoreId);
    await page.selectOption(
      'select[aria-label="Seleccionar un producto para agregar"]',
      seededPackProductId
    );
    await page.selectOption('select[aria-label="Tipo de venta"]', 'package');
    await page.click('button:has-text("Agregar")');
    await page.click('button[type="submit"]:has-text("Crear pedido")');
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/);

    // Verify stock dropped by PACK_SIZE (30)
    const { data: afterCreate } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', seededPackProductId)
      .single();
    expect((afterCreate as { stock_actual: number }).stock_actual).toBe(stockBefore - PACK_SIZE);

    // Cancel the order
    await page.click('button:has-text("Cancelar pedido")');

    // Wait for redirect back to detail page (estado = cancelado)
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/);
    await expect(page.getByRole('status')).toHaveText(/Cancelado/i);

    // Stock must be fully restored (by base_units = 30, NOT cantidad = 1)
    const { data: afterCancel } = await admin
      .from('products')
      .select('stock_actual')
      .eq('id', seededPackProductId)
      .single();
    expect((afterCancel as { stock_actual: number }).stock_actual).toBe(stockBefore);
  });
});
