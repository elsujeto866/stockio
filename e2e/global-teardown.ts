/**
 * Playwright global teardown — cleans up the throwaway E2E tenant and user.
 *
 * Runs once after all tests complete. Reads credentials from
 * e2e/.test-credentials.json (written by global-setup.ts), explicitly deletes
 * all tenant-scoped child rows in reverse-dependency order to avoid RESTRICT FK
 * violations, then deletes the auth user and tenant row, then removes the
 * credentials file.
 *
 * Also sweeps orphaned E2E tenants from crashed prior runs (> 2 hours old).
 */

import type { FullConfig } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// WebSocket stub — see global-setup.ts for rationale.
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

const CREDENTIALS_PATH = join(process.cwd(), 'e2e', '.test-credentials.json');

/**
 * Deletes all tenant-scoped rows in reverse-dependency order to avoid RESTRICT
 * FK violations that would block a bare `DELETE FROM tenants`.
 *
 * Internal FKs without ON DELETE CASCADE (i.e. RESTRICT by default):
 *   payments.invoice_id  → invoices(id)
 *   invoices.order_id    → orders(id)
 *   order_items.product_id → products(id)
 *   lots.product_id      → products(id)
 *   lots.purchase_id     → purchases(id)
 *   purchase_items.product_id → products(id)
 *   purchases.supplier_id → suppliers(id)
 *   orders.store_id      → stores(id)
 *
 * Deletion order (leaf → root):
 *   payments → lots → invoices → order_items → purchase_items →
 *   orders → purchases → products → stores → suppliers → tenant_invoice_counters
 *
 * Does NOT delete profiles — those are auth-owned and must be removed via
 * admin.auth.admin.deleteUser() so Supabase cleans up auth.users correctly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function purgeTenantData(admin: SupabaseClient<any, any, any>, tenantId: string): Promise<void> {
  const tables = [
    'payments',
    'lots',
    'invoices',
    'order_items',
    'purchase_items',
    'orders',
    'purchases',
    'products',
    'stores',
    'suppliers',
    'tenant_invoice_counters',
  ] as const;

  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq('tenant_id', tenantId);
    if (error) {
      console.warn(
        `[E2E teardown] Warning: failed to delete from ${table} for tenant ${tenantId}:`,
        error.message,
      );
    }
  }
}

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  loadEnvLocal();

  if (!existsSync(CREDENTIALS_PATH)) {
    console.log('[E2E teardown] No credentials file found — nothing to clean up.');
    return;
  }

  const { email, userId, tenantId } = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8')) as {
    email: string;
    userId: string;
    tenantId: string;
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    console.warn('[E2E teardown] Missing env vars — skipping remote cleanup. Delete manually.');
    return;
  }

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });

  // 1. Purge child rows in safe dependency order before the tenant-delete runs.
  if (tenantId) {
    await purgeTenantData(admin, tenantId);
  }

  // 2. Delete auth user (cascades the profiles row via ON DELETE CASCADE).
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.warn(`[E2E teardown] Warning: failed to delete auth user ${userId}:`, error.message);
    }
  }

  // 3. Delete the tenant row — child tables are already empty, so no RESTRICT violation.
  if (tenantId) {
    const { error } = await admin.from('tenants').delete().eq('id', tenantId);
    if (error) {
      console.warn(`[E2E teardown] Warning: failed to delete tenant ${tenantId}:`, error.message);
    }
  }

  unlinkSync(CREDENTIALS_PATH);
  console.log(`[E2E teardown] Cleaned up test user: ${email}`);

  // 4. Orphan sweep — remove E2E tenants left by crashed prior runs (> 2 h old).
  //    The 2-hour age guard prevents nuking a concurrently-running suite's tenant.
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: orphans, error: sweepErr } = await admin
      .from('tenants')
      .select('id')
      .like('nombre', 'E2E Tenant %')
      .lt('created_at', twoHoursAgo);

    if (sweepErr) {
      console.warn('[E2E teardown] Orphan sweep query failed:', sweepErr.message);
      return;
    }

    if (!orphans || orphans.length === 0) return;

    console.log(`[E2E teardown] Sweeping ${orphans.length} orphaned E2E tenant(s)...`);

    for (const orphan of orphans) {
      try {
        const orphanId = (orphan as { id: string }).id;

        // Look up profiles so we can delete their auth.users entries.
        const { data: profiles } = await admin
          .from('profiles')
          .select('id')
          .eq('tenant_id', orphanId);

        if (profiles) {
          for (const profile of profiles) {
            await admin.auth.admin.deleteUser((profile as { id: string }).id);
          }
        }

        await purgeTenantData(admin, orphanId);

        const { error: delErr } = await admin.from('tenants').delete().eq('id', orphanId);
        if (delErr) {
          console.warn(
            `[E2E teardown] Orphan sweep: failed to delete tenant ${orphanId}:`,
            delErr.message,
          );
        } else {
          console.log(`[E2E teardown] Swept orphan tenant: ${orphanId}`);
        }
      } catch (orphanErr) {
        console.warn(
          `[E2E teardown] Orphan sweep error for tenant ${(orphan as { id: string }).id}:`,
          orphanErr,
        );
      }
    }
  } catch (sweepError) {
    console.warn('[E2E teardown] Orphan sweep failed unexpectedly:', sweepError);
  }
}
