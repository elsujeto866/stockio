/**
 * UserBadge — RSC presentational component for the top navigation.
 *
 * Renders a circular initial avatar plus the user's display name and role,
 * so the signed-in identity is visible on EVERY (app) page, not just the
 * dashboard. Replaces the old "Conectado como <email>" chip.
 *
 * - Display name: profile.nombre when set, otherwise the email.
 * - Initial: uppercased first character of the display name.
 * - Role: mapped to a Spanish label; omitted when the profile has no role.
 *
 * Styling targets the brand-orange nav bar: cream circle, brand-colored
 * initial, white text. No I/O — all data arrives as props.
 */

import type { Profile } from '@/lib/data/profiles';

interface Props {
  /** profiles.nombre — may be null/blank, in which case we fall back to email. */
  name: string | null;
  /** Auth email — always present; the guaranteed fallback for name and initial. */
  email: string;
  /** profiles.rol — null when the profile could not be resolved. */
  rol: Profile['rol'] | null;
}

const ROLE_LABELS: Record<NonNullable<Props['rol']>, string> = {
  admin: 'Administrador',
  operador: 'Operador',
};

export function UserBadge({ name, email, rol }: Props) {
  const displayName = name?.trim() ? name.trim() : email;
  const initial = (displayName.charAt(0) || '?').toUpperCase();
  const role = rol ? ROLE_LABELS[rol] : null;

  return (
    <div className="flex items-center gap-2" aria-label={`Usuario ${displayName}`}>
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream text-brand text-sm font-bold ring-2 ring-white/30"
      >
        {initial}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="max-w-[10rem] truncate text-sm font-semibold text-white">
          {displayName}
        </span>
        {role && (
          <span className="text-xs font-medium text-white/70">{role}</span>
        )}
      </span>
    </div>
  );
}
