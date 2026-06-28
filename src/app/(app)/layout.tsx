import { requireUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/data/profiles';
import { NavSignOutButton } from '@/components/NavSignOutButton';
import { UserBadge } from '@/components/UserBadge';
import { NavLinks } from '@/components/layout/NavLinks';

/**
 * Protected shell layout for all (app) routes.
 * Calls requireUser() which redirects unauthenticated visitors to /login.
 * Belt-and-suspenders with the middleware matcher.
 *
 * Top navigation: bold brand-orange bar with white wordmark and nav links.
 * Sign-out button (type="button", not type="submit") lives on the far right
 * so that E2E [type=submit] selectors still target only content form buttons.
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
    <div className="min-h-screen bg-cream">
      <nav className="bg-brand shadow-md">
        <div className="max-w-2xl mx-auto px-4">
          {/* Top row: wordmark + user identity + sign-out, always visible */}
          <div className="flex items-center justify-between h-14 gap-3">
            <span className="font-bold text-white text-lg tracking-tight">
              🛒 Stockio
            </span>
            <div className="flex items-center gap-4">
              <UserBadge
                name={profile?.nombre ?? null}
                email={user.email ?? ''}
                rol={profile?.rol ?? null}
              />
              {/* type="button" avoids [type=submit] collision with content forms */}
              <NavSignOutButton />
            </div>
          </div>

          {/* Nav links: wrap instead of overflowing on narrow (mobile) screens */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-2.5">
            <NavLinks />
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
