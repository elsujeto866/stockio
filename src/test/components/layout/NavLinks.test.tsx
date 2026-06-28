/**
 * Unit tests for NavLinks (client island — WU2).
 *
 * Verifies:
 *  - the link matching the current pathname gets the active class and aria-current="page"
 *  - non-matching links do NOT get aria-current
 *  - the /receivables link exists in the nav
 *  - startsWith matching: /stores/new is also active for the /stores link
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUsePathname = vi.fn<() => string>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'aria-current': ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-current'?: string;
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

import { NavLinks } from '@/components/layout/NavLinks';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NavLinks — active state', () => {
  it('marks the /dashboard link as active when pathname is /dashboard', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<NavLinks />);

    const dashboardLink = screen.getByRole('link', { name: /inicio/i });
    expect(dashboardLink).toHaveAttribute('aria-current', 'page');
  });

  it('does NOT mark /stores as active when pathname is /dashboard', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<NavLinks />);

    const storesLink = screen.getByRole('link', { name: /tiendas/i });
    expect(storesLink).not.toHaveAttribute('aria-current', 'page');
  });

  it('marks /stores as active when pathname is /stores/new (startsWith match)', () => {
    mockUsePathname.mockReturnValue('/stores/new');
    render(<NavLinks />);

    const storesLink = screen.getByRole('link', { name: /tiendas/i });
    expect(storesLink).toHaveAttribute('aria-current', 'page');
  });

  it('marks /receivables as active when pathname is /receivables', () => {
    mockUsePathname.mockReturnValue('/receivables');
    render(<NavLinks />);

    const link = screen.getByRole('link', { name: /cobrar/i });
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});

describe('NavLinks — /receivables link exists', () => {
  it('renders a link to /receivables', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<NavLinks />);

    const link = screen.getByRole('link', { name: /cobrar/i });
    expect(link).toHaveAttribute('href', '/receivables');
  });
});

describe('NavLinks — all expected links are present', () => {
  it('renders links for all main sections including receivables', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<NavLinks />);

    expect(screen.getByRole('link', { name: /inicio/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /productos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tiendas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pedidos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /proveedores/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /compras/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /facturas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cobrar/i })).toBeInTheDocument();
  });
});
