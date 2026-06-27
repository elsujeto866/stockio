/**
 * provision-admin.ts
 *
 * One-time script to bootstrap a new tenant and its first admin user.
 * Uses the Supabase secret-key (admin) client — bypasses Row Level Security.
 *
 * Usage:
 *   npm run provision -- --tenant "Business Name" --email admin@example.com --password secret123
 *
 * Env-var fallbacks (useful for automation / CI):
 *   PROVISION_TENANT="Business Name" \
 *   PROVISION_EMAIL=admin@example.com \
 *   PROVISION_PASSWORD=secret123 \
 *   npm run provision
 *
 * Prerequisites:
 *   .env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 *   The script loads .env.local automatically.
 *
 * Idempotency:
 *   If the email already exists in auth.users the script aborts with a clear
 *   message. Delete the existing user in the Supabase Dashboard or choose a
 *   different email before retrying.
 *
 * IMPORTANT (cloud project):
 *   Disable self-signup in the Supabase Dashboard so that no one can register
 *   without going through this script:
 *     Authentication > Sign In/Up settings > "Enable new user signups" → OFF
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// WebSocket stub — Node < 22 has no native WebSocket; supabase-js initializes a
// RealtimeClient on construction which throws without one. This script never
// uses realtime, so provide a no-op transport (same pattern as e2e/global-setup.ts).
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
// Load .env.local into process.env
// Same approach as vitest.config.mts — existing env vars take precedence
// so CI systems can override without touching the file.
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

// ---------------------------------------------------------------------------
// Parse CLI args with env-var fallbacks
// ---------------------------------------------------------------------------
function parseArgs(): { tenant: string; email: string; password: string } {
  const args = process.argv.slice(2);

  const get = (flag: string, envKey: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    return process.env[envKey];
  };

  const tenant = get('--tenant', 'PROVISION_TENANT');
  const email = get('--email', 'PROVISION_EMAIL');
  const password = get('--password', 'PROVISION_PASSWORD');

  const missing: string[] = [];
  if (!tenant) missing.push('--tenant / PROVISION_TENANT');
  if (!email) missing.push('--email / PROVISION_EMAIL');
  if (!password) missing.push('--password / PROVISION_PASSWORD');

  if (missing.length > 0) {
    console.error('Missing required arguments:', missing.join(', '));
    console.error(
      '\nUsage:\n  npm run provision -- --tenant "Business Name" --email admin@example.com --password secret123'
    );
    process.exit(1);
  }

  return { tenant: tenant!, email: email!, password: password! };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  loadEnvLocal();
  const { tenant, email, password } = parseArgs();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    console.error(
      'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY\n' +
        'Populate .env.local before running this script.'
    );
    process.exit(1);
  }

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: _NoopWebSocket as never },
  });

  console.log(`\nProvisioning tenant "${tenant}" with admin "${email}"...\n`);

  // 1. Create tenant row
  const { data: tenantRow, error: tenantErr } = await admin
    .from('tenants')
    .insert({ nombre: tenant })
    .select('id')
    .single();

  if (tenantErr) {
    console.error('Failed to create tenant:', tenantErr.message);
    process.exit(1);
  }

  const tenantId = (tenantRow as { id: string }).id;
  console.log(`[1/3] Tenant created:    ${tenantId}`);

  // 2. Create auth user — email_confirm: true skips the verification email flow
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr) {
    // Roll back the orphan tenant row before aborting
    await admin.from('tenants').delete().eq('id', tenantId);

    const alreadyExists =
      authErr.message.toLowerCase().includes('already') ||
      (authErr as unknown as { status?: number }).status === 422;

    if (alreadyExists) {
      console.error(`Auth user "${email}" already exists.`);
      console.error(
        'Delete the existing user in the Supabase Dashboard or choose a different email.'
      );
    } else {
      console.error('Failed to create auth user:', authErr.message);
    }
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`[2/3] Auth user created: ${userId}`);

  // 3. Insert profile row (id must match auth user id — FK to auth.users)
  const { error: profileErr } = await admin.from('profiles').insert({
    id: userId,
    tenant_id: tenantId,
    nombre: email.split('@')[0],
    rol: 'admin',
  });

  if (profileErr) {
    console.error('Failed to create profile:', profileErr.message);
    console.error(
      'Auth user and tenant were created — partial state. Clean up manually in the Supabase Dashboard.'
    );
    process.exit(1);
  }

  console.log(`[3/3] Profile created   (rol=admin, tenant_id=${tenantId})\n`);
  console.log('=== Provisioning complete ===');
  console.log(`Tenant : "${tenant}"  (id: ${tenantId})`);
  console.log(`Email  : ${email}`);
  console.log(`User ID: ${userId}`);
  console.log(
    '\nIMPORTANT — Cloud project: disable self-signup if not already done:\n' +
      '  Supabase Dashboard > Authentication > Sign In/Up settings\n' +
      '  > "Enable new user signups" → OFF'
  );
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
