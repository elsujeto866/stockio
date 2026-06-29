import { requireUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/data/profiles';
import { AppShell } from '@/components/layout/AppShell';

/**
 * Protected shell layout for all (app) routes.
 * Calls requireUser() which redirects unauthenticated visitors to /login.
 * Belt-and-suspenders with the middleware matcher.
 *
 * Renders the AppShell client island with user/profile data as props.
 * AppShell owns the mobile sidebar state and renders the collapsible
 * left sidebar + slim top bar + page content.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  return (
    <AppShell
      name={profile?.nombre ?? null}
      email={user.email ?? ''}
      rol={profile?.rol ?? null}
    >
      {children}
    </AppShell>
  );
}
