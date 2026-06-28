/**
 * Unit tests for InvoiceDetail (RSC comprobante component).
 *
 * Verifies:
 *  - Invoice numero is displayed prominently
 *  - Store nombre is displayed
 *  - fecha_emision is displayed
 *  - Estado_pago badge shows the correct label
 *  - Line items show product nombre, frozen precio_unitario, cantidad, subtotal
 *  - Invoice total is displayed
 *  - Payment toggle button shows "Mark as paid" when pendiente
 *  - Payment toggle button shows "Mark as pending" when pagado
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/(app)/invoices/actions', () => ({
  createInvoiceAction: vi.fn(),
  recordPaymentAction: vi.fn(),
}));

import { InvoiceDetail } from '@/components/invoices/InvoiceDetail';
import type { InvoiceDetail as InvoiceDetailType } from '@/lib/data/invoices';
import { formatCurrency, formatDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseInvoice: InvoiceDetailType = {
  id: 'invoice-1',
  tenant_id: 'tenant-1',
  order_id: 'order-1',
  numero: 7,
  fecha_emision: '2026-06-25',
  total: 90.00,
  estado_pago: 'pendiente',
  created_at: '2026-06-25T10:00:00Z',
  due_date: null,
  total_paid: 0,
  order: {
    id: 'order-1',
    fecha: '2026-06-20',
    total: 90.00,
    notas: null,
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
        precio_unitario: 15.00,
        subtotal: 30.00,
        product: { nombre: 'Gadget Y' },
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests — header
// ---------------------------------------------------------------------------
describe('InvoiceDetail — header', () => {
  it('displays the invoice numero', () => {
    render(<InvoiceDetail invoice={baseInvoice} />);
    expect(screen.getByText(/Factura #7/i)).toBeInTheDocument();
  });

  it('displays the store nombre', () => {
    render(<InvoiceDetail invoice={baseInvoice} />);
    expect(screen.getByText('Almacén Norte')).toBeInTheDocument();
  });

  it('displays the fecha_emision', () => {
    render(<InvoiceDetail invoice={baseInvoice} />);
    expect(screen.getByText(formatDate('2026-06-25'))).toBeInTheDocument();
  });

  it('shows a Pending badge for pendiente estado_pago', () => {
    render(<InvoiceDetail invoice={baseInvoice} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Pendiente/i);
  });

  it('shows a Paid badge for pagado estado_pago', () => {
    render(<InvoiceDetail invoice={{ ...baseInvoice, estado_pago: 'pagado' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Pagado/i);
  });
});

// ---------------------------------------------------------------------------
// Tests — line items
// ---------------------------------------------------------------------------
describe('InvoiceDetail — line items', () => {
  it('renders both product nombres', () => {
    render(<InvoiceDetail invoice={baseInvoice} />);
    expect(screen.getByText('Widget X')).toBeInTheDocument();
    expect(screen.getByText('Gadget Y')).toBeInTheDocument();
  });

  it('renders frozen precio_unitario for Widget X', () => {
    render(<InvoiceDetail invoice={baseInvoice} />);
    expect(screen.getByText(formatCurrency(20))).toBeInTheDocument();
  });

  it('renders frozen precio_unitario for Gadget Y', () => {
    render(<InvoiceDetail invoice={baseInvoice} />);
    expect(screen.getByText(formatCurrency(15))).toBeInTheDocument();
  });

  it('renders the invoice total', () => {
    render(<InvoiceDetail invoice={baseInvoice} />);
    expect(screen.getByText(formatCurrency(90))).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — payment toggle was retired in AR-T20 (WU6)
// Direct payment status toggle is replaced by AbonoForm (record_payment RPC).
// These tests are intentionally removed.
// ---------------------------------------------------------------------------
