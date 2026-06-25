import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-side guard: returns the authenticated user or redirects to /login.
 *
 * Uses getUser() — validates with the Supabase Auth server on every call.
 * Belt-and-suspenders with middleware: middleware handles the redirect at the
 * edge, but calling requireUser() in a protected layout or Server Action adds
 * a defence-in-depth layer in case the middleware matcher is misconfigured.
 *
 * Only valid in Server Components, Server Actions, and Route Handlers.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return user as User;
}
