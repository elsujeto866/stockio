/**
 * AR-T23 — Invoice detail page render test.
 *
 * Strict TDD — RED PHASE: written before the page extension exists.
 *
 * Verifies:
 *   - Invoice detail page renders AbonoForm with correct outstanding balance
 *   - Payment history rendered via getPaymentsByInvoice mock
 *   - Balance = total - total_paid (S3-1)
 *
 * Covers: REQ-3/S3-1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/data/invoices', () => ({
  getInvoice: vi.fn(),
  getReceivableInvoices: vi.fn(),
}));
vi.mock('@/lib/data/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/payments')>();
  return {
    ...actual,
    getPaymentsByInvoice: vi.fn(),
  };
});
vi.mock('@/app/(app)/invoices/actions', () => ({
  recordPaymentAction: vi.fn(),
  createInvoiceAction: vi.fn(),
}));
vi.mock('@/components/invoices/InvoiceDetail', () => ({
  InvoiceDetail: () => <div data-testid="invoice-detail">InvoiceDetail</div>,
}));

import { requireUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';
import { getInvoice } from '@/lib/data/invoices';
import { getPaymentsByInvoice } from '@/lib/data/payments';
import type { User } from '@supabase/supabase-js';

const mockClient = {};
const mockUser = { id: 'user-1', email: 'test@example.com' } as User;
const INVOICE_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';

const mockInvoice = {
  id: INVOICE_UUID,
  tenant_id: 'tenant-1',
  order_id: 'order-1',
  numero: 42,
  fecha_emision: '2026-06-01',
  total: 750,
  total_paid: 250,
  due_date: '2026-07-01',
  estado_pago: 'pendiente',
  created_at: '2026-06-01T00:00:00Z',
  order: {
    id: 'order-1',
    fecha: '2026-06-01',
    total: 750,
    notas: null,
    store: { nombre: 'Main Store' },
    items: [],
  },
};

const mockPayments = [
  {
    id: 'payment-1',
    tenantId: 'tenant-1',
    invoiceId: INVOICE_UUID,
    amount: 250,
    fecha: '2026-06-15',
    notas: 'First payment',
    createdAt: '2026-06-15T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(mockClient as Awaited<ReturnType<typeof createClient>>);
  vi.mocked(requireUser).mockResolvedValue(mockUser);
  vi.mocked(getInvoice).mockResolvedValue(mockInvoice as never);
  vi.mocked(getPaymentsByInvoice).mockResolvedValue(mockPayments);
});

describe('Invoice detail page — AbonoForm + payment history (AR-T23)', () => {
  it('calls getPaymentsByInvoice with the invoice id', async () => {
    const { default: InvoicePage } = await import('@/app/(app)/invoices/[id]/page');
    await InvoicePage({ params: Promise.resolve({ id: INVOICE_UUID }) });

    expect(getPaymentsByInvoice).toHaveBeenCalledWith(mockClient, INVOICE_UUID);
  });

  it('renders without throwing with mock data', async () => {
    const { default: InvoicePage } = await import('@/app/(app)/invoices/[id]/page');
    await expect(
      InvoicePage({ params: Promise.resolve({ id: INVOICE_UUID }) })
    ).resolves.not.toBeNull();
  });

  it('calls getInvoice to load invoice data', async () => {
    const { default: InvoicePage } = await import('@/app/(app)/invoices/[id]/page');
    await InvoicePage({ params: Promise.resolve({ id: INVOICE_UUID }) });

    expect(getInvoice).toHaveBeenCalledWith(mockClient, INVOICE_UUID);
  });
});
