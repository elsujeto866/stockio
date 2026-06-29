/**
 * Unit tests for AppShell — print layout assertions (PC-T11).
 *
 * AppShell is a Client Component ('use client'). Tests verify:
 *  - The wrapper element around <Sidebar> has print:hidden class (S6-1)
 *  - The <header> element has print:hidden class (S6-1)
 *
 * These are class-presence assertions only — jsdom cannot evaluate @media print rules.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — dependencies that require browser/Next.js environment
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Stub Sidebar and child components to avoid deep dependency chain in unit test
vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar-stub" />,
}));

vi.mock('@/components/UserBadge', () => ({
  UserBadge: () => <span />,
}));

vi.mock('@/components/NavSignOutButton', () => ({
  NavSignOutButton: () => <button type="button" />,
}));

import { AppShell } from '@/components/layout/AppShell';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AppShell — print:hidden (S6-1 class-presence assertions)', () => {
  it('the wrapper around <Sidebar> has print:hidden class', () => {
    const { container } = render(
      <AppShell name="Test User" email="test@example.com" rol={null}>
        <div>content</div>
      </AppShell>
    );

    // The wrapper is expected to be a div with className containing 'print:hidden'
    // and `contents` (display:contents — layout-neutral on screen)
    const sidebarWrapper = container.querySelector('[data-testid="sidebar-stub"]')?.parentElement;
    expect(sidebarWrapper?.className).toContain('print:hidden');
  });

  it('the <header> element has print:hidden class', () => {
    const { container } = render(
      <AppShell name="Test User" email="test@example.com" rol={null}>
        <div>content</div>
      </AppShell>
    );

    const header = container.querySelector('header');
    expect(header?.className).toContain('print:hidden');
  });
});
