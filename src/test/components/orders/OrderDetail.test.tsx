/**
 * Unit tests for OrderDetail (RSC presentational component).
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
 *  - Invoice section: shows "Generate invoice" form when invoiceId null + not cancelled
 *  - Invoice section: shows "View invoice" link when invoiceId is provided
 *  - Invoice section: no Generate invoice button when estado is cancelado
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

vi.mock('@/app/(app)/orders/actions', () => ({
  markDeliveredAction: vi.fn(),
  cancelOrderAction: vi.fn(),
  createOrderAction: vi.fn(),
}));

vi.mock('@/app/(app)/invoices/actions', () => ({
  createInvoiceAction: vi.fn(),
  setPaymentStatusAction: vi.fn(),
}));

// GenerateInvoiceButton is a 'use client' component tested separately.
// Stub it here so OrderDetail tests stay focused on RSC rendering logic.
vi.mock('@/components/orders/GenerateInvoiceButton', () => ({
  GenerateInvoiceButton: ({ orderId }: { orderId: string }) => (
    <form>
      <input type="hidden" name="orderId" value={orderId} />
      <button type="submit">Generar factura</button>
    </form>
  ),
}));

import { OrderDetail } from '@/components/orders/OrderDetail';
import type { OrderDetail as OrderDetailType } from '@/lib/data/orders';
import { formatCurrency, formatDate } from '@/lib/format';

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
      sale_unit: 'unit',
      units_per_package_snapshot: 1,
      base_units: 3,
      product: { nombre: 'Widget X' },
    },
    {
      id: 'item-2',
      product_id: 'prod-2',
      cantidad: 2,
      precio_unitario: 7.50,
      subtotal: 15.00,
      sale_unit: 'unit',
      units_per_package_snapshot: 1,
      base_units: 2,
      product: { nombre: 'Gadget Y' },
    },
  ],
};

// Order with a package line (S2-T11)
const packageOrder: OrderDetailType = {
  ...baseOrder,
  id: 'order-pkg',
  items: [
    {
      id: 'item-pkg',
      product_id: 'prod-3',
      cantidad: 2,          // 2 packs
      precio_unitario: 150.00, // frozen pack price
      subtotal: 300.00,
      sale_unit: 'package',
      units_per_package_snapshot: 30,
      base_units: 60,       // 2 × 30
      product: { nombre: 'Arroz Kilo' },
    },
    {
      id: 'item-unit',
      product_id: 'prod-4',
      cantidad: 5,
      precio_unitario: 10.00,
      subtotal: 50.00,
      sale_unit: 'unit',
      units_per_package_snapshot: 1,
      base_units: 5,
      product: { nombre: 'Azúcar' },
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests — header
// ---------------------------------------------------------------------------
describe('OrderDetail — header', () => {
  it('displays the store nombre', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText('Almacén Norte')).toBeInTheDocument();
  });

  it('displays the fecha', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText(formatDate('2026-06-15'))).toBeInTheDocument();
  });

  it('shows a Pending badge for pendiente estado', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Pendiente/i);
  });

  it('shows a Delivered badge for entregado estado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'entregado' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Entregado/i);
  });

  it('shows a Cancelled badge for cancelado estado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'cancelado' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Cancelado/i);
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

// ---------------------------------------------------------------------------
// Tests — line items
// ---------------------------------------------------------------------------
describe('OrderDetail — line items', () => {
  it('renders both product nombres', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText('Widget X')).toBeInTheDocument();
    expect(screen.getByText('Gadget Y')).toBeInTheDocument();
  });

  it('renders frozen precio_unitario for each item', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText(formatCurrency(20))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(15))).toBeInTheDocument();
  });

  it('renders the authoritative order total', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(screen.getByText(formatCurrency(75))).toBeInTheDocument();
  });

  it('shows "—" when total is null', () => {
    render(<OrderDetail order={{ ...baseOrder, total: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — order actions (pendiente only)
// ---------------------------------------------------------------------------
describe('OrderDetail — actions (pendiente only)', () => {
  it('shows Mark-as-delivered button when estado is pendiente', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(
      screen.getByRole('button', { name: /marcar como entregado/i })
    ).toBeInTheDocument();
  });

  it('shows Cancel order button when estado is pendiente', () => {
    render(<OrderDetail order={baseOrder} />);
    expect(
      screen.getByRole('button', { name: /cancelar pedido/i })
    ).toBeInTheDocument();
  });

  it('does NOT show action buttons when estado is entregado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'entregado' }} />);
    expect(
      screen.queryByRole('button', { name: /marcar como entregado/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cancelar pedido/i })
    ).not.toBeInTheDocument();
  });

  it('does NOT show action buttons when estado is cancelado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'cancelado' }} />);
    expect(
      screen.queryByRole('button', { name: /marcar como entregado/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cancelar pedido/i })
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — invoice section
// ---------------------------------------------------------------------------
describe('OrderDetail — invoice section', () => {
  it('shows a Generate invoice button when invoiceId is null and estado is pendiente', () => {
    render(<OrderDetail order={baseOrder} invoiceId={null} />);
    expect(
      screen.getByRole('button', { name: /generar factura/i })
    ).toBeInTheDocument();
  });

  it('shows a Generate invoice button when invoiceId is null and estado is entregado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'entregado' }} invoiceId={null} />);
    expect(
      screen.getByRole('button', { name: /generar factura/i })
    ).toBeInTheDocument();
  });

  it('does NOT show Generate invoice button when estado is cancelado', () => {
    render(<OrderDetail order={{ ...baseOrder, estado: 'cancelado' }} invoiceId={null} />);
    expect(
      screen.queryByRole('button', { name: /generar factura/i })
    ).not.toBeInTheDocument();
  });

  it('shows a View invoice link when invoiceId is provided', () => {
    render(<OrderDetail order={baseOrder} invoiceId="invoice-123" />);
    const link = screen.getByRole('link', { name: /ver factura/i });
    expect(link).toHaveAttribute('href', '/invoices/invoice-123');
  });

  it('does NOT show Generate invoice button when invoiceId is provided', () => {
    render(<OrderDetail order={baseOrder} invoiceId="invoice-123" />);
    expect(
      screen.queryByRole('button', { name: /generar factura/i })
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// S2-T11: Package line label rendering (REQ-2, Scenario 2.2)
// RED until OrderDetail renders pack label for package lines.
// ---------------------------------------------------------------------------
describe('OrderDetail — package line labels (S2-T11)', () => {
  it('renders pack label for package lines (paca(s) × snapshot u)', () => {
    render(<OrderDetail order={packageOrder} />);
    // Package line (2 packs × 30 u) should show a pack label
    expect(screen.getByText(/paca.*30/i)).toBeInTheDocument();
  });

  it('does not render pack label for unit lines', () => {
    render(<OrderDetail order={packageOrder} />);
    // Unit line (Azúcar) should show the legacy × quantity format, no pack label
    // The pack label (paca(s) × N u) should only appear for the Arroz Kilo package line
    // We verify the sub-label "paca(s) × 30 u" is NOT present for the unit line.
    // (The label "×5" should be present for Azúcar.)
    expect(screen.getByText(/×5/)).toBeInTheDocument();
    // The sub-label with "× 30 u" only appears for the Arroz Kilo package line
    const packSubLabels = screen.queryAllByText(/paca\(s\) × \d+ u/i);
    expect(packSubLabels.length).toBe(1); // only the Arroz Kilo package line
  });

  it('unit line still shows the legacy × quantity format', () => {
    render(<OrderDetail order={packageOrder} />);
    expect(screen.getByText(/×5/)).toBeInTheDocument();
  });
});
