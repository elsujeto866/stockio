/**
 * Playwright global setup — provisions a throwaway E2E tenant and admin user.
 *
 * Runs once before any test file is loaded. Writes credentials to
 * e2e/.test-credentials.json (gitignored) so auth.spec.ts can read them.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
 * The file is loaded automatically here (same manual-parse approach as
 * vitest.config.mts) so the script works without shell-level env injection.
 */

import type { FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// WebSocket stub — required on Node 20 which lacks native WebSocket support.
// Same pattern used in the integration tests (rls.test.ts, rpcs.test.ts).
// Suppresses realtime connection attempts; we don't use realtime here.
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
// Env loader (mirrors vitest.config.mts loadLocalEnv)
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

export const CREDENTIALS_PATH = join(process.cwd(), 'e2e', '.test-credentials.json');
const TEST_PASSWORD = 'E2eTestPass123!';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      '[E2E setup] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. ' +
        'Populate .env.local before running E2E tests.'
    );
  }

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: _NoopWebSocket as any },
  });

  const unique = Date.now().toString(36);
  const email = `e2e+${unique}@stockio.test`;

  // 1. Create throwaway tenant
  const { data: tenant, error: tenantErr } = await admin
    .from('tenants')
    .insert({ nombre: `E2E Tenant ${unique}` })
    .select('id')
    .single();

  if (tenantErr) {
    throw new Error(`[E2E setup] Failed to create tenant: ${tenantErr.message}`);
  }
  const tenantId = (tenant as { id: string }).id;

  // 2. Create auth user (email_confirm: true skips verification email)
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (authErr) {
    await admin.from('tenants').delete().eq('id', tenantId);
    throw new Error(`[E2E setup] Failed to create auth user: ${authErr.message}`);
  }
  const userId = authData.user.id;

  // 3. Create profile
  const { error: profileErr } = await admin.from('profiles').insert({
    id: userId,
    tenant_id: tenantId,
    nombre: 'E2E Admin',
    rol: 'admin',
  });

  if (profileErr) {
    throw new Error(`[E2E setup] Failed to create profile: ${profileErr.message}`);
  }

  // 4. Persist credentials for test files
  writeFileSync(
    CREDENTIALS_PATH,
    JSON.stringify({ email, password: TEST_PASSWORD, userId, tenantId }, null, 2)
  );

  console.log(`[E2E setup] Provisioned test user: ${email}  (tenant: ${tenantId})`);
}
