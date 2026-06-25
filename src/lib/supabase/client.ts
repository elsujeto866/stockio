import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a Supabase client for use in Client Components.
 * Uses the publishable key + RLS for all data access.
 *
 * Do NOT use this in Server Components, Server Actions, or Route Handlers —
 * use server.ts instead so the session cookie is correctly read and refreshed.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
