'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type LoginResult = { error: string } | void;

/**
 * Server Action: sign in with email + password.
 * On success, redirects to /dashboard.
 * On failure, returns a typed error object for the form to display.
 *
 * No public sign-up — users are provisioned manually via the admin client.
 */
export async function login(formData: FormData): Promise<LoginResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect('/dashboard');
}

/**
 * Server Action: sign out the current user and redirect to /login.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
