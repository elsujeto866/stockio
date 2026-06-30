/**
 * Unit tests for InvoiceCard.
 *
 * Verifies:
 *  - Invoice numero is displayed
 *  - Store nombre is displayed
 *  - fecha_emision is displayed
 *  - Total is formatted with $ sign
 *  - Estado_pago badge shows the correct label
 *  - Card links to /invoices/[id]
 *  - Handles null store gracefully
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

import { InvoiceCard } from '@/components/invoices/InvoiceCard';
import type { InvoiceListItem } from '@/lib/data/invoices';
import { formatCurrency, formatDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseInvoice: InvoiceListItem = {
  id: 'invoice-1',
  tenant_id: 'tenant-1',
  order_id: 'order-1',
  numero: 42,
  fecha_emision: '2026-06-25',
  total: 150.00,
  estado_pago: 'pendiente',
  created_at: '2026-06-25T10:00:00Z',
  due_date: null,
  total_paid: 0,
  // SRI snapshot — null on pre-SRI invoices (backward compat, WU5)
  subtotal_base_imponible: null,
  valor_iva: null,
  comprador_tipo_identificacion: null,
  comprador_numero_identificacion: null,
  comprador_razon_social: null,
  emisor_ruc: null,
  emisor_razon_social: null,
  emisor_estab: null,
  emisor_pto_emi: null,
  order: { store: { nombre: 'Almacén Norte' } },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('InvoiceCard', () => {
  it('displays the invoice numero', () => {
    render(<InvoiceCard invoice={baseInvoice} />);
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it('displays the store nombre', () => {
    render(<InvoiceCard invoice={baseInvoice} />);
    expect(screen.getByText('Almacén Norte')).toBeInTheDocument();
  });

  it('displays the fecha_emision', () => {
    render(<InvoiceCard invoice={baseInvoice} />);
    expect(screen.getByText(formatDate('2026-06-25'))).toBeInTheDocument();
  });

  it('displays the total formatted with $', () => {
    render(<InvoiceCard invoice={baseInvoice} />);
    expect(screen.getByText(formatCurrency(150))).toBeInTheDocument();
  });

  it('shows a Pending badge for pendiente estado_pago', () => {
    render(<InvoiceCard invoice={baseInvoice} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Pendiente/i);
  });

  it('shows a Paid badge for pagado estado_pago', () => {
    render(<InvoiceCard invoice={{ ...baseInvoice, estado_pago: 'pagado' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Pagado/i);
  });

  it('shows an Unpaid badge when estado_pago is null', () => {
    render(<InvoiceCard invoice={{ ...baseInvoice, estado_pago: null }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Sin pagar/i);
  });

  it('links to /invoices/[id]', () => {
    render(<InvoiceCard invoice={baseInvoice} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/invoices/invoice-1');
  });

  it('shows "Unknown store" when order store is null', () => {
    render(<InvoiceCard invoice={{ ...baseInvoice, order: null }} />);
    expect(screen.getByText(/Tienda desconocida/i)).toBeInTheDocument();
  });
});
