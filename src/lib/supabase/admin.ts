/**
 * SERVER ONLY — NEVER import this file in Client Components, pages, or any
 * module that may be bundled for the browser.
 *
 * The service_role key passed to this client BYPASSES Row Level Security
 * entirely. If this key reaches the browser, any user can read and write
 * every row in the database across all tenants.
 *
 * The key is intentionally NOT prefixed with NEXT_PUBLIC_ so Next.js never
 * includes it in the client bundle. Add a lint/grep guard in CI to assert
 * that no file outside this one references SUPABASE_SERVICE_ROLE_KEY.
 *
 * Valid use cases: manual user provisioning scripts, admin one-off tasks,
 * setting auth.users app_metadata. NOT for the normal request/response flow.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. ' +
        'This client must only be used in server-side scripts and tasks.'
    );
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
