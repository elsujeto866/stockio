/**
 * Unit tests for OrderCard (WU-B1).
 *
 * Verifies:
 *  - store nombre is displayed
 *  - fecha is displayed
 *  - estado badge shows the correct label
 *  - total is formatted with $ sign (or "—" when null)
 *  - card is a link pointing to /orders/[id]
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

import { OrderCard } from '@/components/orders/OrderCard';
import type { OrderListItem } from '@/lib/data/orders';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseOrder: OrderListItem = {
  id: 'order-1',
  tenant_id: 'tenant-1',
  store_id: 'store-1',
  fecha: '2026-06-01',
  estado: 'pendiente',
  total: 99.50,
  notas: null,
  created_at: '2026-06-01T00:00:00Z',
  store: { nombre: 'Almacén Central' },
};

describe('OrderCard', () => {
  it('displays the store nombre', () => {
    render(<OrderCard order={baseOrder} />);
    expect(screen.getByText('Almacén Central')).toBeInTheDocument();
  });

  it('displays the fecha', () => {
    render(<OrderCard order={baseOrder} />);
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
  });

  it('shows a Pending badge for pendiente estado', () => {
    render(<OrderCard order={baseOrder} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Pending/i);
  });

  it('shows a Delivered badge for entregado estado', () => {
    render(<OrderCard order={{ ...baseOrder, estado: 'entregado' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Delivered/i);
  });

  it('shows a Cancelled badge for cancelado estado', () => {
    render(<OrderCard order={{ ...baseOrder, estado: 'cancelado' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Cancelled/i);
  });

  it('displays the total formatted with $', () => {
    render(<OrderCard order={baseOrder} />);
    expect(screen.getByText(/\$99\.50/)).toBeInTheDocument();
  });

  it('displays "—" when total is null', () => {
    render(<OrderCard order={{ ...baseOrder, total: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('the card links to /orders/[id]', () => {
    render(<OrderCard order={baseOrder} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/orders/order-1');
  });

  it('shows "Unknown store" when store is null', () => {
    render(<OrderCard order={{ ...baseOrder, store: null }} />);
    expect(screen.getByText(/Unknown store/i)).toBeInTheDocument();
  });
});
