/**
 * Unit tests for RecentOrdersWidget.
 *
 * Verifies:
 *  - store nombre is displayed
 *  - fecha is displayed
 *  - estado badge label is correct
 *  - total formatted with $
 *  - each order links to /orders/[id]
 *  - empty state renders when no orders
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock Next.js Link to a plain anchor in jsdom.
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

import { RecentOrdersWidget } from '@/components/dashboard/RecentOrdersWidget';
import type { OrderListItem } from '@/lib/data/orders';
import { formatCurrency, formatDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseOrder: OrderListItem = {
  id: 'order-abc',
  tenant_id: 't1',
  store_id: 's1',
  fecha: '2026-06-15',
  estado: 'pendiente',
  total: 75.50,
  notas: null,
  created_at: '2026-06-15T00:00:00Z',
  store: { nombre: 'Almacén Norte' },
};

describe('RecentOrdersWidget', () => {
  it('renders the store nombre', () => {
    render(<RecentOrdersWidget orders={[baseOrder]} />);
    expect(screen.getByText('Almacén Norte')).toBeInTheDocument();
  });

  it('renders the order fecha', () => {
    render(<RecentOrdersWidget orders={[baseOrder]} />);
    expect(screen.getByText(formatDate('2026-06-15'))).toBeInTheDocument();
  });

  it('renders a Pending badge for pendiente estado', () => {
    render(<RecentOrdersWidget orders={[baseOrder]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Pendiente/i);
  });

  it('renders a Delivered badge for entregado estado', () => {
    render(<RecentOrdersWidget orders={[{ ...baseOrder, estado: 'entregado' }]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Entregado/i);
  });

  it('renders a Cancelled badge for cancelado estado', () => {
    render(<RecentOrdersWidget orders={[{ ...baseOrder, estado: 'cancelado' }]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Cancelado/i);
  });

  it('renders the total formatted with $', () => {
    render(<RecentOrdersWidget orders={[baseOrder]} />);
    expect(screen.getByText(formatCurrency(75.5))).toBeInTheDocument();
  });

  it('renders "—" when total is null', () => {
    render(<RecentOrdersWidget orders={[{ ...baseOrder, total: null }]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('each order links to /orders/[id]', () => {
    render(<RecentOrdersWidget orders={[baseOrder]} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/orders/order-abc');
  });

  it('renders the empty state when no orders', () => {
    render(<RecentOrdersWidget orders={[]} />);
    expect(screen.getByText(/No hay pedidos todavía/i)).toBeInTheDocument();
  });

  it('does NOT render the empty state when orders are present', () => {
    render(<RecentOrdersWidget orders={[baseOrder]} />);
    expect(screen.queryByText(/No hay pedidos todavía/i)).not.toBeInTheDocument();
  });

  it('renders "Unknown store" when store is null', () => {
    render(<RecentOrdersWidget orders={[{ ...baseOrder, store: null }]} />);
    expect(screen.getByText(/Tienda desconocida/i)).toBeInTheDocument();
  });
});
