/**
 * Catalog E2E spec (PC-T14 / WU6).
 *
 * Unconditional assertions — NO soft fallbacks, no if(count), no test.skip.
 *
 * Before the test runs, `beforeAll` seeds a product with:
 *  - categoria → a category heading appears
 *  - nombre, precio_unitario → card text content
 *  - image_path → a real signed URL → a real <img> element
 *
 * The seed uses the admin client so it bypasses RLS (same pattern as
 * visual-product-picker.spec.ts and accounts-receivable.spec.ts).
 *
 * Cleanup: global-teardown cascades deletion of the test tenant.
 *
 * Scenarios:
 *  CAT-1: navigate to /catalogo → at least one category heading visible
 *  CAT-2: at least one product card with nombre + "P.V.P" price text
 *  CAT-3: at least one <img> visible inside a card (photo loaded eagerly)
 *  CAT-4: "Catálogo" nav link visible in sidebar (S8-1)
 *  CAT-5: clicking the Catálogo link routes to /catalogo (URL check)
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Env loader — mirrors global-setup.ts (needed in each Worker process)
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
// Admin client factory (bypasses RLS)
// ---------------------------------------------------------------------------
function makeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secretKey = process.env.SUPABASE_SECRET_KEY!;
  if (!url || !secretKey) {
    throw new Error('[catalog E2E] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  }
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: _NoopWebSocket as never },
  });
}

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

// ---------------------------------------------------------------------------
// Unique identifiers per run
// ---------------------------------------------------------------------------
const SUFFIX = Date.now().toString(36);
const PRODUCT_NAME = `CAT E2E Galleta ${SUFFIX}`;
const PRODUCT_PRICE = 1500;
const PRODUCT_CATEGORIA = 'Galletas E2E';

// Storage path for the seeded photo
const PHOTO_BUCKET = 'product-photos';
const PHOTO_STORAGE_PATH = `${creds.tenantId}/catalog-e2e-${SUFFIX}.jpg`;

// ---------------------------------------------------------------------------
// Login helper
// ---------------------------------------------------------------------------
async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

// ---------------------------------------------------------------------------
// beforeAll: seed a product with categoria and a real photo
// ---------------------------------------------------------------------------
test.beforeAll(async () => {
  const admin = makeAdmin();
  const tenantId = creds.tenantId;

  // Upload a test image to the product-photos bucket so the signed URL resolves
  const fixturePath = join(process.cwd(), 'e2e', 'fixtures', 'test-image.png');
  const imageBytes = readFileSync(fixturePath);

  const { error: uploadErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(PHOTO_STORAGE_PATH, imageBytes, {
      contentType: 'image/png',
      upsert: true,
    });
  if (uploadErr) {
    throw new Error(`[catalog E2E] Photo upload failed: ${uploadErr.message}`);
  }

  // Insert an active product with categoria and the uploaded image_path
  const { error: productErr } = await admin
    .from('products')
    .insert({
      nombre: PRODUCT_NAME,
      categoria: PRODUCT_CATEGORIA,
      precio_unitario: PRODUCT_PRICE,
      stock_actual: 10,
      stock_minimo: 2,
      tenant_id: tenantId,
      activo: true,
      image_path: PHOTO_STORAGE_PATH,
    });
  if (productErr) {
    throw new Error(`[catalog E2E] Seed product failed: ${productErr.message}`);
  }

  console.log(`[catalog E2E] Seeded product "${PRODUCT_NAME}" with photo ${PHOTO_STORAGE_PATH}`);
});

// ---------------------------------------------------------------------------
// Tests — serial so login state is predictable
// ---------------------------------------------------------------------------
test.describe('Catalog page', () => {
  test.describe.configure({ mode: 'serial' });

  // CAT-1: category heading visible
  test('CAT-1: /catalogo shows at least one category heading', async ({ page }) => {
    await login(page);
    await page.goto('/catalogo');

    // At least one heading (h1 "Catálogo" + h2 category names)
    // We assert the seeded category heading is visible — unconditional
    const categoryHeading = page.getByRole('heading', { name: PRODUCT_CATEGORIA });
    await expect(categoryHeading).toBeVisible({ timeout: 15000 });
  });

  // CAT-2: product card with nombre + P.V.P text
  test('CAT-2: product card shows nombre and P.V.P price', async ({ page }) => {
    await login(page);
    await page.goto('/catalogo');

    // Product name must appear on the page
    const productText = page.getByText(PRODUCT_NAME);
    await expect(productText).toBeVisible({ timeout: 15000 });

    // "P.V.P" price label must appear in at least one card
    const pvpLabel = page.getByText(/P\.V\.P/).first();
    await expect(pvpLabel).toBeVisible({ timeout: 10000 });
  });

  // CAT-3: photo <img> visible inside a card
  test('CAT-3: at least one product card shows a photo <img>', async ({ page }) => {
    await login(page);
    await page.goto('/catalogo');

    // Wait for the page to fully load (category heading present)
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible({ timeout: 15000 });

    // Find the article card containing our product name, then assert an <img> is inside it
    const cardArticle = page.locator('article').filter({ hasText: PRODUCT_NAME });
    await expect(cardArticle).toBeVisible({ timeout: 5000 });

    const img = cardArticle.locator('img');
    await expect(img).toBeVisible({ timeout: 10000 });

    // Verify src is a non-empty URL (signed URL resolves to something)
    const src = await img.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toBe('');
  });

  // CAT-4: Catálogo nav link visible in sidebar
  test('CAT-4: "Catálogo" nav link is visible in the sidebar', async ({ page }) => {
    await login(page);
    await page.goto('/catalogo');

    const navLink = page.getByRole('link', { name: /catálogo/i });
    await expect(navLink).toBeVisible({ timeout: 10000 });
  });

  // CAT-5: clicking Catálogo nav link routes to /catalogo
  test('CAT-5: clicking the Catálogo nav link routes to /catalogo', async ({ page }) => {
    await login(page);
    // Start from dashboard so we can click the link and verify navigation
    await page.goto('/dashboard');

    const navLink = page.getByRole('link', { name: /catálogo/i });
    await expect(navLink).toBeVisible({ timeout: 10000 });
    await navLink.click();

    await expect(page).toHaveURL('/catalogo');
  });
});
