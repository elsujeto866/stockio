/**
 * Unit tests for Sidebar (WU1 — client island).
 *
 * Covers:
 *  - Structural: section titles GENERAL / VENTAS render; COMPRAS is hidden
 *    (SHOW_COMPRAS flag is false — procurement not active)
 *  - Links: 6 links render (Proveedores + Compras absent while flag is off)
 *  - Active state: aria-current="page" on matching link, absent on others,
 *    startsWith matching for sub-routes
 *  - Collapse toggle: aria-expanded flips, labels change, localStorage persists,
 *    section titles hidden when collapsed, state restored on mount
 *  - Mobile overlay: backdrop visible when mobileOpen=true, hidden otherwise,
 *    backdrop click / Escape key / link click all call onClose
 *  - SHOW_COMPRAS flag: when off, COMPRAS title + its two links are absent;
 *    GENERAL and VENTAS sections remain intact
 *
 * Migrates and supersedes NavLinks.test.tsx — NavLinks has been removed.
 *
 * Mock conventions (same pattern as the old NavLinks test):
 *  - next/navigation: mock usePathname
 *  - next/link: stub renders a real <a> and forwards href, aria-current, onClick, aria-label
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// -----------------------------------------------------------------------
// Mocks — hoisted by Vitest before imports
// -----------------------------------------------------------------------

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
    onClick,
    'aria-label': ariaLabel,
    title,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-current'?: React.AriaAttributes['aria-current'];
    onClick?: React.MouseEventHandler;
    'aria-label'?: string;
    title?: string;
  }) => (
    <a
      href={href}
      className={className}
      aria-current={ariaCurrent}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </a>
  ),
}));

import { Sidebar } from '@/components/layout/Sidebar';

// -----------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePathname.mockReturnValue('/dashboard');
  window.localStorage.clear();
});

// -----------------------------------------------------------------------
// Structure
// -----------------------------------------------------------------------

describe('Sidebar — structure', () => {
  it('renders section title GENERAL', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getByText('GENERAL')).toBeInTheDocument();
  });

  it('does NOT render section title COMPRAS (SHOW_COMPRAS flag is off)', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('COMPRAS')).not.toBeInTheDocument();
  });

  it('renders section title VENTAS', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getByText('VENTAS')).toBeInTheDocument();
  });

  it('nav landmark has aria-label "Navegación principal"', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(
      screen.getByRole('navigation', { name: 'Navegación principal' })
    ).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Links — all 8 present with correct hrefs
// -----------------------------------------------------------------------

describe('Sidebar — links', () => {
  it('renders 6 nav links (GENERAL + VENTAS only) while SHOW_COMPRAS is off', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);

    // GENERAL section — always visible
    expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /productos/i })).toHaveAttribute('href', '/products');

    // VENTAS section — always visible
    expect(screen.getByRole('link', { name: /tiendas/i })).toHaveAttribute('href', '/stores');
    expect(screen.getByRole('link', { name: /pedidos/i })).toHaveAttribute('href', '/orders');
    expect(screen.getByRole('link', { name: /facturas/i })).toHaveAttribute('href', '/invoices');
    expect(screen.getByRole('link', { name: /cobrar/i })).toHaveAttribute('href', '/receivables');

    // COMPRAS links must be absent while flag is off
    expect(screen.queryByRole('link', { name: /proveedores/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^compras$/i })).not.toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Active state
// -----------------------------------------------------------------------

describe('Sidebar — active state', () => {
  it('marks the /dashboard link active when pathname is /dashboard', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: /inicio/i })).toHaveAttribute('aria-current', 'page');
  });

  it('does NOT mark /tiendas active when pathname is /dashboard', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: /tiendas/i })).not.toHaveAttribute('aria-current', 'page');
  });

  it('marks /stores active when pathname is /stores/new (startsWith match)', () => {
    mockUsePathname.mockReturnValue('/stores/new');
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: /tiendas/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /inicio/i })).not.toHaveAttribute('aria-current', 'page');
  });

  it('marks /receivables active when pathname is /receivables', () => {
    mockUsePathname.mockReturnValue('/receivables');
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: /cobrar/i })).toHaveAttribute('aria-current', 'page');
  });
});

// -----------------------------------------------------------------------
// Collapse toggle
// -----------------------------------------------------------------------

describe('Sidebar — collapse toggle', () => {
  it('toggle button has aria-expanded=true when sidebar is expanded (default)', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /colapsar menú/i })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggle button has aria-expanded=false and label "Expandir menú" after collapsing', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /colapsar menú/i }));
    expect(
      screen.getByRole('button', { name: /expandir menú/i })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('persists collapsed=true to localStorage key "sidebar-collapsed" after toggle', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /colapsar menú/i }));
    expect(window.localStorage.getItem('sidebar-collapsed')).toBe('1');
  });

  it('persists collapsed=false to localStorage after expanding', () => {
    window.localStorage.setItem('sidebar-collapsed', '1');
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /expandir menú/i }));
    expect(window.localStorage.getItem('sidebar-collapsed')).toBe('0');
  });

  it('restores collapsed state from localStorage on mount', () => {
    window.localStorage.setItem('sidebar-collapsed', '1');
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    // When collapsed, the toggle label must be "Expandir menú"
    expect(
      screen.getByRole('button', { name: /expandir menú/i })
    ).toBeInTheDocument();
  });

  it('hides section titles when sidebar is collapsed', () => {
    window.localStorage.setItem('sidebar-collapsed', '1');
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('GENERAL')).not.toBeInTheDocument();
    expect(screen.queryByText('COMPRAS')).not.toBeInTheDocument();
    expect(screen.queryByText('VENTAS')).not.toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Mobile overlay
// -----------------------------------------------------------------------

describe('Sidebar — mobile overlay', () => {
  it('shows the backdrop overlay when mobileOpen is true', () => {
    render(<Sidebar mobileOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument();
  });

  it('does not show the backdrop when mobileOpen is false', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Sidebar mobileOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('sidebar-backdrop'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed while mobile overlay is open', () => {
    const onClose = vi.fn();
    render(<Sidebar mobileOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does NOT call onClose when Escape is pressed while mobile is closed', () => {
    const onClose = vi.fn();
    render(<Sidebar mobileOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when a nav link is clicked', () => {
    const onClose = vi.fn();
    render(<Sidebar mobileOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('link', { name: /inicio/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// SHOW_COMPRAS flag behaviour
// -----------------------------------------------------------------------

describe('Sidebar — SHOW_COMPRAS flag off (default)', () => {
  it('hides the COMPRAS section title', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('COMPRAS')).not.toBeInTheDocument();
  });

  it('hides the Proveedores link', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /proveedores/i })).not.toBeInTheDocument();
  });

  it('hides the Compras link', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /^compras$/i })).not.toBeInTheDocument();
  });

  it('still renders GENERAL section with Inicio and Productos', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getByText('GENERAL')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /inicio/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /productos/i })).toBeInTheDocument();
  });

  it('still renders VENTAS section with all four links', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getByText('VENTAS')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tiendas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pedidos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /facturas/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cobrar/i })).toBeInTheDocument();
  });
});
