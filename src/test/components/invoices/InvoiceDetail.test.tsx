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

// ---------------------------------------------------------------------------
// WU6 — SRI comprobante blocks
//
// RED until InvoiceDetail is updated with emisor/buyer/IVA blocks.
// ---------------------------------------------------------------------------

// SRI invoice fixture with all fiscal snapshot fields populated.
// IVA values (80.00 / 12.00) are deliberately different from item prices (20.00, 15.00)
// to avoid getByText conflicts in the IVA breakdown assertions.
// 92 / 1.15 = 80.00 exactly; 92 - 80 = 12. ✓
const sriInvoice: InvoiceDetailType = {
  ...baseInvoice,
  total: 92.00,
  subtotal_base_imponible: 80.00,
  valor_iva: 12.00,
  emisor_ruc: '0992234789001',
  emisor_razon_social: 'Distribuidora El Sol',
  emisor_estab: '001',
  emisor_pto_emi: '001',
  comprador_tipo_identificacion: '07',
  comprador_numero_identificacion: '9999999999999',
  comprador_razon_social: 'CONSUMIDOR FINAL',
};

describe('InvoiceDetail — WU6 SRI comprobante blocks', () => {
  // Scenario 7.3 — pre-SRI invoice (all null) renders without crash
  it('pre-SRI invoice (all SRI cols null): renders without throwing; no emisor/buyer/IVA block (Scenario 7.3)', () => {
    // baseInvoice has all SRI cols null
    render(<InvoiceDetail invoice={baseInvoice} />);
    expect(screen.getByText(/Factura #7/i)).toBeInTheDocument();
    expect(screen.queryByText(/ruc/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/consumidor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/iva/i)).not.toBeInTheDocument();
  });

  // Scenario 7.1 — secuencial formatted correctly
  it('emisor block shows formatted secuencial 001-001-000000007 (Scenario 7.1)', () => {
    // numero=7, estab='001', pto_emi='001' → '001-001-000000007'
    render(<InvoiceDetail invoice={sriInvoice} />);
    expect(screen.getByText('001-001-000000007')).toBeInTheDocument();
  });

  // Scenario 7.1 — emisor block header fields
  it('emisor block shows emisor_razon_social and emisor_ruc', () => {
    render(<InvoiceDetail invoice={sriInvoice} />);
    expect(screen.getByText('Distribuidora El Sol')).toBeInTheDocument();
    expect(screen.getByText('0992234789001')).toBeInTheDocument();
  });

  // Scenario 7.2 — IVA breakdown visible
  it('IVA breakdown shows subtotal (80), IVA 15% label, and iva amount (12) (Scenario 7.2)', () => {
    render(<InvoiceDetail invoice={sriInvoice} />);
    // IVA 15% label
    expect(screen.getByText(/iva.*15/i)).toBeInTheDocument();
    // Subtotal base imponible ($80.00 — unique, no collision with item prices 20/15)
    expect(screen.getByText(formatCurrency(80))).toBeInTheDocument();
    // IVA amount ($12.00 — unique)
    expect(screen.getByText(formatCurrency(12))).toBeInTheDocument();
  });

  // Scenario 7.4 — tipo code '07' → 'Consumidor Final'
  it('buyer block shows human label Consumidor Final for tipo 07 (Scenario 7.4)', () => {
    render(<InvoiceDetail invoice={sriInvoice} />);
    expect(screen.getByText('Consumidor Final')).toBeInTheDocument();
    // Raw code '07' must NOT appear as a label
    expect(screen.queryByText(/^07$/)).not.toBeInTheDocument();
  });

  // REQ-7e — independent block guards
  it('buyer block absent when comprador_tipo_identificacion is null even if emisor block is present (REQ-7e)', () => {
    const noComprador: InvoiceDetailType = {
      ...sriInvoice,
      comprador_tipo_identificacion: null,
      comprador_numero_identificacion: null,
      comprador_razon_social: null,
    };
    render(<InvoiceDetail invoice={noComprador} />);
    // Emisor block present
    expect(screen.getByText('Distribuidora El Sol')).toBeInTheDocument();
    // Buyer block absent
    expect(screen.queryByText('Consumidor Final')).not.toBeInTheDocument();
    expect(screen.queryByText('9999999999999')).not.toBeInTheDocument();
  });

  // Backward compat with specific tipo labels
  it('buyer block shows Cédula label for tipo 05', () => {
    const cedula: InvoiceDetailType = {
      ...sriInvoice,
      comprador_tipo_identificacion: '05',
      comprador_numero_identificacion: '1713175071',
      comprador_razon_social: 'Juan Pérez',
    };
    render(<InvoiceDetail invoice={cedula} />);
    expect(screen.getByText('Cédula')).toBeInTheDocument();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
  });
});
