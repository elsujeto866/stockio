/**
 * Accounts Receivable E2E tests — genuine assertions (AR-T30, fix iteration).
 *
 * All assertions are end-to-end with real before/after numbers.
 * No soft fallbacks, no console.warn escapes.
 *
 * Flow (sequential — workers: 1):
 *   SETUP: create store (30-day terms) + product ($100) + seed lot + order + invoice
 *   AR-S2: invoice detail shows AbonoForm with outstanding = $100.00
 *   AR-S1: /receivables shows store row, saldo = $100.00, corriente = $100.00
 *   AR-S4: /stores/[id] reachable via "Ver saldo" UI link, shows saldo = $100.00
 *   AR-S3: record $60 partial → outstanding = $40.00, estado Pendiente
 *           /receivables saldo drops to $40.00
 *           /stores/[id] saldo drops to $40.00
 *           record $40 remainder → outstanding = $0.00, estado Pagado
 *           submit button disabled when balance = 0
 *
 * ⚠ FEFO SEED GOTCHA:
 *   create_order FEFO RPC checks lots.quantity > 0, NOT just stock_actual.
 *   After creating a product via UI (stock_actual=5, no lots), the FEFO loop
 *   finds no lots → defensive guard raises "Stock insuficiente: disponible 0".
 *   Fix: seed an adjustment lot via Supabase admin after product creation.
 *
 * Requires migrations 20260628100000–20260628100300 applied.
 * Uses throwaway test tenant from e2e/global-setup.ts.
 * Cleanup: global-teardown cascades deletion of entire test tenant.
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

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
// WebSocket stub — same pattern as global-setup.ts (Node 20 workaround)
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

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      '[E2E] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local'
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
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

// Unique suffix per test run to avoid collisions with prior tenant data
const SUFFIX = Date.now().toString(36);
const STORE_NAME    = `E2E AR Store ${SUFFIX}`;
const PRODUCT_NAME  = `E2E AR Product ${SUFFIX}`;
const PRODUCT_PRICE = 100;       // $100.00 → invoice total = $100.00 (qty 1)
const PAYMENT_PARTIAL   = 60;    // first abono: $60.00
const PAYMENT_REMAINDER = 40;    // second abono: $40.00 (clears invoice)

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[name=email]', creds.email);
  await page.fill('[name=password]', creds.password);
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
}

// ---------------------------------------------------------------------------
// Shared state — set by SETUP, consumed by scenario tests
// ---------------------------------------------------------------------------
let createdStoreId   = '';
let createdProductId = '';
let createdInvoiceId = '';

// ---------------------------------------------------------------------------
// SETUP: create the data needed by all AR scenarios
// ---------------------------------------------------------------------------
test.describe('AR — SETUP: create store + product + order + invoice', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('SETUP-1: create store with 30-day payment terms', async ({ page }) => {
    await page.goto('/stores/new');
    await page.fill('[name=nombre]', STORE_NAME);
    const termsInput = page.locator('[name=payment_terms_days]');
    if (await termsInput.isVisible()) {
      await termsInput.fill('30');
    }
    await page.click('[type=submit]');
    await expect(page).toHaveURL('/stores');

    // Extract storeId from the "Editar" link href
    const storeLi  = page.locator('li').filter({ hasText: STORE_NAME });
    const editLink = storeLi.first().getByRole('link', { name: /editar/i });
    await expect(editLink).toBeVisible();
    const editHref = await editLink.getAttribute('href');
    createdStoreId = editHref?.replace('/edit', '').split('/').pop() ?? '';
    expect(createdStoreId, 'storeId must be captured from edit link').toBeTruthy();
  });

  test('SETUP-2: create product at $100.00, seed adjustment lot for FEFO', async ({ page }) => {
    await page.goto('/products/new');
    await page.fill('[name=nombre]',           PRODUCT_NAME);
    await page.fill('[name=precio_unitario]',  String(PRODUCT_PRICE));
    await page.fill('[name=stock_actual]',     '5');
    await page.fill('[name=stock_minimo]',     '1');
    await page.click('[type=submit]');
    await expect(page).toHaveURL('/products');

    // Extract product ID from the "Editar" link so we can seed the lot below.
    const productItem = page
      .locator('ul[aria-label="Lista de productos"] li')
      .filter({ hasText: PRODUCT_NAME });
    await expect(productItem.first()).toBeVisible();
    const editHref = await productItem
      .first()
      .getByRole('link', { name: /editar/i })
      .getAttribute('href');
    createdProductId = editHref?.split('/products/')[1]?.split('/')[0] ?? '';
    expect(createdProductId, 'productId must be captured from product edit link').toBeTruthy();

    // Seed an adjustment lot so create_order FEFO can consume stock.
    // Background: the product form sets stock_actual=5, but no lots row is created.
    // create_order first checks stock_actual (passes), then runs FEFO over lots.
    // If lots are empty the defensive guard raises "Stock insuficiente: disponible 0".
    const today = new Date().toISOString().split('T')[0];
    const admin = createAdminClient();
    const { error: lotErr } = await admin.from('lots').insert({
      tenant_id:     creds.tenantId,
      product_id:    createdProductId,
      lot_type:      'adjustment',
      quantity:      5,
      received_date: today,
    });
    expect(lotErr, `Failed to seed adjustment lot: ${lotErr?.message}`).toBeNull();
  });

  test('SETUP-3: create order for the test store', async ({ page }) => {
    await page.goto('/orders/new');

    // Select the store
    await page.getByLabel(/tienda/i).selectOption({ label: STORE_NAME });

    // Select the product and add it (qty defaults to 1 → total = $100)
    const productSel = page.getByLabel(/seleccionar un producto/i);
    await expect(productSel).toBeVisible();
    // Locate the option by partial text match (option text includes price suffix),
    // then select by UUID value to avoid exact-label dependency.
    const productId = await productSel.evaluate(
      (el: HTMLSelectElement, name: string) => {
        const opt = Array.from(el.options).find((o) => o.text.includes(name));
        return opt?.value ?? '';
      },
      PRODUCT_NAME
    );
    expect(productId, `Product "${PRODUCT_NAME}" must appear in the order form`).toBeTruthy();
    await productSel.selectOption(productId);
    await page.getByRole('button', { name: /^agregar$/i }).click();

    // Wait for item to appear in list before submitting
    await expect(page.getByRole('list', { name: /order items/i })).toBeVisible();

    // Submit
    await page.getByRole('button', { name: /crear pedido/i }).click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/);
  });

  test('SETUP-4: generate invoice from the order', async ({ page }) => {
    // Navigate to orders list and find our order (OrderCard wraps the whole card in a Link)
    await page.goto('/orders');
    const orderLink = page.getByRole('link').filter({ hasText: STORE_NAME }).first();
    await expect(orderLink).toBeVisible();
    await orderLink.click();
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/);

    // Click "Generar factura" → redirects to /invoices/{id}
    const genBtn = page.getByRole('button', { name: /generar factura/i });
    await expect(genBtn).toBeVisible({ timeout: 10_000 });
    await Promise.all([
      page.waitForURL(/\/invoices\/[0-9a-f-]+/),
      genBtn.click(),
    ]);

    // Capture invoice ID from URL
    createdInvoiceId = page.url().split('/invoices/')[1]?.split('/')[0] ?? '';
    expect(createdInvoiceId, 'invoiceId must be captured from invoice page URL').toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AR-S2: Invoice detail shows AbonoForm with correct outstanding balance
// ---------------------------------------------------------------------------
test.describe('AR-S2 — invoice detail with AbonoForm', () => {
  test('AR-S2: AbonoForm visible with outstanding = $100.00', async ({ page }) => {
    await login(page);
    expect(createdInvoiceId, 'SETUP-4 must have run first').toBeTruthy();

    await page.goto(`/invoices/${createdInvoiceId}`);

    // AbonoForm heading must be present
    await expect(page.getByRole('heading', { name: /registrar abono/i })).toBeVisible();

    // Outstanding amount must equal the invoice total
    await expect(page.getByText(/Saldo pendiente/))
      .toContainText(`$${PRODUCT_PRICE.toFixed(2)}`);

    // Amount input must exist with max = outstanding
    const amountInput = page.locator('input[name="amount"]');
    await expect(amountInput).toBeVisible();
    await expect(amountInput).toHaveAttribute('max', String(PRODUCT_PRICE));

    // Invoice estado badge must say Pendiente (no payments yet)
    await expect(page.getByRole('status')).toContainText('Pendiente');
  });
});

// ---------------------------------------------------------------------------
// AR-S1: /receivables overview shows store row with correct saldo and bucket
// ---------------------------------------------------------------------------
test.describe('AR-S1 — receivables overview', () => {
  test('AR-S1: /receivables shows store saldo = $100.00 in corriente bucket', async ({ page }) => {
    await login(page);
    expect(createdInvoiceId, 'SETUP-4 must have run first').toBeTruthy();

    await page.goto('/receivables');

    // Table headers must be visible — invoice exists so rows render
    await expect(page.getByRole('columnheader', { name: /saldo/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /corriente/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /1-30/i })).toBeVisible();

    // Our store must appear in the table
    const storeRow = page.locator('table tr').filter({ hasText: STORE_NAME });
    await expect(storeRow).toBeVisible();

    // Saldo column (td index 1) = $100.00
    await expect(storeRow.locator('td').nth(1))
      .toContainText(`$${PRODUCT_PRICE.toFixed(2)}`);

    // Corriente column (td index 2) = $100.00
    // due_date = today + 30 → dpd = −30 → bucket = 'current'
    await expect(storeRow.locator('td').nth(2))
      .toContainText(`$${PRODUCT_PRICE.toFixed(2)}`);
  });
});

// ---------------------------------------------------------------------------
// AR-S4: /stores/[id] reachable via "Ver saldo" UI link and shows saldo
// ---------------------------------------------------------------------------
test.describe('AR-S4 — store detail balance page via UI link', () => {
  test('AR-S4: "Ver saldo" link navigates to store detail page showing saldo = $100.00', async ({ page }) => {
    await login(page);
    expect(createdStoreId, 'SETUP-1 must have run first').toBeTruthy();

    await page.goto('/stores');

    // Find the store card for our test store
    const storeLi = page.locator('li').filter({ hasText: STORE_NAME });
    await expect(storeLi.first()).toBeVisible();

    // "Ver saldo" link added by W1 fix must be present
    const saldoLink = storeLi.first().getByRole('link', { name: /ver saldo/i });
    await expect(saldoLink).toBeVisible();

    // Click it — must navigate to /stores/[id]
    await saldoLink.click();
    await expect(page).toHaveURL(new RegExp(`/stores/${createdStoreId}$`));

    // "Saldo por cobrar" section must be present
    await expect(page.getByText(/saldo por cobrar/i)).toBeVisible();

    // Balance figure must reflect $100.00 (no payments yet)
    const saldoCard = page.locator('.rounded-2xl').filter({ has: page.getByText(/saldo por cobrar/i) });
    await expect(saldoCard).toContainText(`$${PRODUCT_PRICE.toFixed(2)}`);
  });
});

// ---------------------------------------------------------------------------
// AR-S3: Full abono flow — partial payment then remainder
// ---------------------------------------------------------------------------
test.describe('AR-S3 — record payment flow', () => {
  test(
    'AR-S3: partial $60 drops outstanding to $40; remainder $40 flips estado to Pagado',
    async ({ page }) => {
      await login(page);
      expect(createdInvoiceId, 'SETUP-4 must have run first').toBeTruthy();
      expect(createdStoreId,   'SETUP-1 must have run first').toBeTruthy();

      const expectedAfterPartial = PRODUCT_PRICE - PAYMENT_PARTIAL; // $40.00

      // ── Part A: record partial payment ($60) ─────────────────────────────────
      await page.goto(`/invoices/${createdInvoiceId}`);

      // Confirm outstanding before payment
      await expect(page.getByText(/Saldo pendiente/))
        .toContainText(`$${PRODUCT_PRICE.toFixed(2)}`);

      // Fill and submit abono
      await page.locator('input[name="amount"]').fill(String(PAYMENT_PARTIAL));
      await page.getByRole('button', { name: /registrar abono/i }).click();

      // After redirect back to the same invoice URL, outstanding must drop
      await expect(page.getByText(/Saldo pendiente/))
        .toContainText(`$${expectedAfterPartial.toFixed(2)}`, { timeout: 15_000 });

      // Estado must still be Pendiente
      await expect(page.getByRole('status')).toContainText('Pendiente');

      // Payment history section must appear (first abono visible)
      await expect(page.getByText(/historial de abonos/i)).toBeVisible();

      // ── /receivables must show updated saldo ─────────────────────────────────
      await page.goto('/receivables');
      const storeRow = page.locator('table tr').filter({ hasText: STORE_NAME });
      await expect(storeRow).toBeVisible();
      await expect(storeRow.locator('td').nth(1))
        .toContainText(`$${expectedAfterPartial.toFixed(2)}`);

      // ── /stores/[id] must show updated saldo ─────────────────────────────────
      await page.goto(`/stores/${createdStoreId}`);
      await expect(page.getByText(/saldo por cobrar/i)).toBeVisible();
      const saldoCard = page.locator('.rounded-2xl').filter({ has: page.getByText(/saldo por cobrar/i) });
      await expect(saldoCard).toContainText(`$${expectedAfterPartial.toFixed(2)}`);

      // ── Part B: record remainder ($40) ────────────────────────────────────────
      await page.goto(`/invoices/${createdInvoiceId}`);
      await expect(page.locator('input[name="amount"]')).toBeVisible();

      // Confirm outstanding = $40 before the second payment
      await expect(page.getByText(/Saldo pendiente/))
        .toContainText(`$${expectedAfterPartial.toFixed(2)}`);

      await page.locator('input[name="amount"]').fill(String(PAYMENT_REMAINDER));
      await page.getByRole('button', { name: /registrar abono/i }).click();

      // Outstanding must reach $0.00
      await expect(page.getByText(/Saldo pendiente/))
        .toContainText('$0.00', { timeout: 15_000 });

      // Estado badge must flip to Pagado
      await expect(page.getByRole('status')).toContainText('Pagado', { timeout: 15_000 });

      // Submit button must be disabled (balance = 0)
      await expect(page.getByRole('button', { name: /registrar abono/i }))
        .toBeDisabled();
    }
  );
});
