/**
 * Unit tests for NavSignOutButton (client component).
 *
 * Contract that MUST hold: the button is icon-only but keeps the accessible
 * name "Cerrar sesión" via aria-label, because e2e/auth.spec.ts selects it by
 * that role name. Losing the name would break the auth sign-out E2E and make
 * the control invisible to screen readers.
 *
 * useTransition is mocked so we control the pending flag without a real action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useTransition: vi.fn() };
});

vi.mock('@/app/(auth)/login/actions', () => ({ signOut: vi.fn() }));

import { useTransition } from 'react';
import { NavSignOutButton } from '@/components/NavSignOutButton';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useTransition).mockReturnValue([false, vi.fn()] as never);
});

describe('NavSignOutButton', () => {
  it('exposes the accessible name "Cerrar sesión" (auth E2E contract)', () => {
    render(<NavSignOutButton />);
    expect(
      screen.getByRole('button', { name: 'Cerrar sesión' })
    ).toBeInTheDocument();
  });

  it('renders an icon and shows no visible label text', () => {
    const { container } = render(<NavSignOutButton />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('Cerrar sesión')).not.toBeInTheDocument();
  });

  it('keeps the accessible name while the sign-out is pending', () => {
    vi.mocked(useTransition).mockReturnValue([true, vi.fn()] as never);
    render(<NavSignOutButton />);
    expect(
      screen.getByRole('button', { name: 'Cerrar sesión' })
    ).toBeInTheDocument();
  });
});
