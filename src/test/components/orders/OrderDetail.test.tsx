/**
 * Unit tests for OrderDetail (WU-B3).
 *
 * Verifies:
 *  - Store nombre is displayed
 *  - Fecha is displayed
 *  - Estado badge shows the correct label
 *  - Optional notas are displayed when present
 *  - Line items show product nombre, cantidad, frozen precio_unitario, subtotal
 *  - Authoritative order.total is shown
 *  - Mark-as-delivered and Cancel buttons are shown ONLY when estado === 'pendiente'
 *  - Buttons are ABSENT for non-pendiente orders
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/(app)/orders/actions', () => ({
  markDeliveredAction: vi.fn(),
  cancelOrderAction: vi.fn(),
  createOrderAction: vi.fn(),
}));

import { OrderDetail } from '@/components/orders/OrderDetail';
import type { OrderDetail as OrderDetailType } from '@/lib/data/orders';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseOrder: OrderDetailType = {
  id: 'order-1',
  tenant_id: 'tenant-1',
  store_id: 'store-1',
  fecha: '2026-06-15',
  estado: 'pendiente',
  total: 75.00,
  notas: 'Rush delivery',
  created_at: '2026-06-15T08:00:00Z',
  store: { nombre: 'Almacén Norte' },
  items: [
    {
      id: 'item-1',
      product_id: 'prod-1',
      cantidad: 3,
      precio_unitario: 20.00,
      subtotal: 60.00,
      product: { nombre: 'Widget X' },
    },
    {
      id: 'item-2',
      product_id: 'prod-2',
      cantidad: 2,
      precio_unitario: 7.50,
      subtotal: 15.00,
      product: { nombre: 'Gadget Y' },
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('OrderDetail — header', () => {
  it('displays the store nombre', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText('Almacén Norte')).toBeInTheDocument();
  });

  it('displays the fecha', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText('2026-06-15')).toBeInTheDocument();
  });

  it('shows a Pending badge for pendiente estado', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Pending/i);
  });

  it('shows a Delivered badge for entregado estado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'entregado' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Delivered/i);
  });

  it('shows a Cancelled badge for cancelado estado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'cancelado' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Cancelled/i);
  });

  it('displays notas when present', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText('Rush delivery')).toBeInTheDocument();
  });

  it('does not render notas section when notas is null', () => {
    render(<OrderDetail order={{ ...baseOrder, notas: null }} />);
    expect(screen.queryByText('Rush delivery')).not.toBeInTheDocument();
  });
});

describe('OrderDetail — line items', () => {
  it('renders both product nombres', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText('Widget X')).toBeInTheDocument();
    expect(screen.getByText('Gadget Y')).toBeInTheDocument();
  });

  it('renders frozen precio_unitario for each item', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText('$20.00')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
  });

  it('renders the authoritative order total', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText('$75.00')).toBeInTheDocument();
  });

  it('shows "—" when total is null', () => {
    render(<OrderDetail order={{ ...baseOrder, total: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('OrderDetail — actions (pendiente only)', () => {
  it('shows Mark-as-delivered button when estado is pendiente', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(
      screen.getByRole('button', { name: /mark as delivered/i })
    ).toBeInTheDocument();
  });

  it('shows Cancel order button when estado is pendiente', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(
      screen.getByRole('button', { name: /cancel order/i })
    ).toBeInTheDocument();
  });

  it('does NOT show action buttons when estado is entregado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'entregado' }} />);
    expect(
      screen.queryByRole('button', { name: /mark as delivered/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cancel order/i })
    ).not.toBeInTheDocument();
  });

  it('does NOT show action buttons when estado is cancelado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'cancelado' }} />);
    expect(
      screen.queryByRole('button', { name: /mark as delivered/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cancel order/i })
    ).not.toBeInTheDocument();
  });
});
