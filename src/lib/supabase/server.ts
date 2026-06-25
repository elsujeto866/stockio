import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client bound to the current request's cookies.
 * Use this in Server Components, Server Actions, and Route Handlers.
 *
 * Uses the anon key + RLS for all data access.
 * For service-role access, use admin.ts (server-only).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // In Server Components, the cookie store is read-only.
            // Writes are a no-op here — the middleware handles session refresh.
          }
        },
      },
    }
  );
}
