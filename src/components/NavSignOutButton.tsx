'use client';

/**
 * NavSignOutButton — client component.
 *
 * Icon-only sign-out control. The accessible name is provided by aria-label
 * ("Cerrar sesión") so e2e/auth.spec.ts can still select it by role name and
 * screen-reader users get a meaningful label despite the icon-only visual.
 *
 * Uses type="button" (not type="submit") so Playwright [type=submit] selectors
 * on content forms do NOT accidentally match this nav control. Calls the
 * signOut Server Action via useTransition; shows a spinner while pending.
 */

import { useTransition } from 'react';
import { signOut } from '@/app/(auth)/login/actions';

export function NavSignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
      disabled={isPending}
      onClick={() => startTransition(() => signOut())}
      className="text-white/70 hover:text-white transition-colors disabled:opacity-50"
    >
      {isPending ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5 animate-spin"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2"
            className="opacity-25"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25" />
        </svg>
      )}
    </button>
  );
}
