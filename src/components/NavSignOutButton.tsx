'use client';

/**
 * NavSignOutButton — client component.
 *
 * Uses type="button" (not type="submit") so that Playwright selectors like
 * [type=submit] on content forms do NOT accidentally match this nav control.
 * Calls the signOut Server Action via useTransition.
 */

import { useTransition } from 'react';
import { signOut } from '@/app/(auth)/login/actions';

export function NavSignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => signOut())}
      className="text-sm text-white/70 hover:text-white transition-colors disabled:opacity-50"
    >
      {isPending ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
