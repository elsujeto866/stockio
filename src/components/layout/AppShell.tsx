'use client';

/**
 * AppShell — Client shell that wires the mobile sidebar state.
 *
 * AppLayout (Server Component) fetches the user/profile data and renders this
 * component, passing the data as primitive props. AppShell owns the mobileOpen
 * state so both the hamburger button (in the top bar) and the Sidebar can share it.
 *
 * Layout structure:
 *   <div.min-h-screen.flex>
 *     <Sidebar mobileOpen onClose />
 *     <div.flex-1.flex-col.min-w-0>
 *       <header>  hamburger (mobile) | wordmark | UserBadge | NavSignOutButton
 *       <main>    {children}
 *     </div>
 *   </div>
 *
 * NavSignOutButton is type="button" ON PURPOSE — keeps [type=submit] E2E
 * selectors from accidentally matching the sign-out control.
 */

import { useState } from 'react';
import type { Profile } from '@/lib/data/profiles';
import { UserBadge } from '@/components/UserBadge';
import { NavSignOutButton } from '@/components/NavSignOutButton';
import { Sidebar } from '@/components/layout/Sidebar';

interface AppShellProps {
  name: string | null;
  email: string;
  rol: Profile['rol'] | null;
  children: React.ReactNode;
}

export function AppShell({ name, email, rol, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream flex">
      {/* Collapsible left sidebar */}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main content column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-brand shadow-md">
          <div className="flex items-center h-14 px-4 gap-3">
            {/* Hamburger — visible on mobile only, opens the sidebar overlay */}
            <button
              type="button"
              aria-label="Abrir menú"
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 text-white hover:text-white/80 transition-colors"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-6 w-6"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Wordmark */}
            <span className="font-bold text-white text-lg tracking-tight">
              🛒 Stockio
            </span>

            {/* User identity + sign-out — pushed to the right */}
            <div className="ml-auto flex items-center gap-4">
              <UserBadge name={name} email={email} rol={rol} />
              {/* type="button" avoids [type=submit] collision with content forms */}
              <NavSignOutButton />
            </div>
          </div>
        </header>

        {/* Page content — individual pages set their own max-widths */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
