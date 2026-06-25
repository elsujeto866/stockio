/**
 * Playwright global teardown — cleans up the throwaway E2E tenant and user.
 *
 * Runs once after all tests complete. Reads credentials from
 * e2e/.test-credentials.json (written by global-setup.ts), deletes the auth
 * user and tenant row, then removes the credentials file.
 */

import type { FullConfig } from '@playwright/test';
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

  // Delete auth user (profiles row cascades via ON DELETE CASCADE)
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }

  // Delete tenant (cascades all tenant data)
  if (tenantId) {
    await admin.from('tenants').delete().eq('id', tenantId);
  }

  unlinkSync(CREDENTIALS_PATH);
  console.log(`[E2E teardown] Cleaned up test user: ${email}`);
}
