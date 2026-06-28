/**
 * Unit tests for invoice Server Actions.
 *
 * AR-T19: Rewrites this file to:
 *   - REMOVE all setPaymentStatusAction / setInvoicePaymentStatus tests
 *   - ADD tests for new recordPaymentAction
 *
 * Verifies:
 *   createInvoiceAction — success redirect; Zod fieldErrors;
 *     "Cancelled orders cannot be invoiced" → friendly error;
 *     "Invoice already exists" → friendly error;
 *     "not found" → friendly error;
 *     requireUser is called.
 *   recordPaymentAction — valid form → calls recordPayment, revalidatePath, redirect;
 *     OverpaymentError → returns error state (no redirect);
 *     CancelledOrderPaymentError → returns error state;
 *     zero amount rejected by Zod before RPC call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/data/invoices', () => ({
  createInvoice: vi.fn(),
}));
vi.mock('@/lib/data/payments', async (importOriginal) => {
  // Keep error classes real so instanceof checks in actions work
  const actual = await importOriginal<typeof import('@/lib/data/payments')>();
  return {
    ...actual,
    recordPayment: vi.fn(),
  };
});

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { createInvoice } from '@/lib/data/invoices';
import {
  recordPayment,
  OverpaymentError,
  CancelledOrderPaymentError,
} from '@/lib/data/payments';
import {
  createInvoiceAction,
  recordPaymentAction,
} from '@/app/(app)/invoices/actions';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const mockClient = {};
const mockUser = { id: 'user-1', email: 'test@example.com' } as User;

const ORDER_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00003333';
const INVOICE_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00004444';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(
    mockClient as Awaited<ReturnType<typeof createClient>>
  );
  vi.mocked(requireUser).mockResolvedValue(mockUser);
});

function validInvoiceFormData(): FormData {
  const fd = new FormData();
  fd.set('orderId', ORDER_UUID);
  return fd;
}

function validPaymentFormData(amount = '300'): FormData {
  const fd = new FormData();
  fd.set('invoiceId', INVOICE_UUID);
  fd.set('amount', amount);
  fd.set('fecha', '2026-06-28');
  return fd;
}

// ---------------------------------------------------------------------------
// createInvoiceAction
// ---------------------------------------------------------------------------
describe('createInvoiceAction', () => {
  it('calls createInvoice and redirects to /invoices/[id] on success', async () => {
    vi.mocked(createInvoice).mockResolvedValue(INVOICE_UUID);

    await createInvoiceAction(null, validInvoiceFormData());

    expect(createInvoice).toHaveBeenCalledWith(mockClient, ORDER_UUID);
    expect(revalidatePath).toHaveBeenCalledWith('/invoices');
    expect(redirect).toHaveBeenCalledWith(`/invoices/${INVOICE_UUID}`);
  });

  it('calls requireUser to guard the action', async () => {
    vi.mocked(createInvoice).mockResolvedValue(INVOICE_UUID);

    await createInvoiceAction(null, validInvoiceFormData());

    expect(requireUser).toHaveBeenCalledOnce();
  });

  it('returns fieldErrors when orderId is not a valid UUID', async () => {
    const fd = new FormData();
    fd.set('orderId', 'not-a-uuid');

    const result = await createInvoiceAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(createInvoice).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns fieldErrors when orderId is missing', async () => {
    const fd = new FormData();

    const result = await createInvoiceAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('returns friendly error when order is cancelled', async () => {
    vi.mocked(createInvoice).mockRejectedValue({
      message: 'Cancelled orders cannot be invoiced',
    });

    const result = await createInvoiceAction(null, validInvoiceFormData());

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/cancelados/i);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns friendly error when invoice already exists', async () => {
    vi.mocked(createInvoice).mockRejectedValue({
      message: `Invoice already exists for order ${ORDER_UUID}`,
    });

    const result = await createInvoiceAction(null, validInvoiceFormData());

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/ya existe/i);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns friendly error when order not found', async () => {
    vi.mocked(createInvoice).mockRejectedValue({
      message: `Order ${ORDER_UUID} not found in tenant`,
    });

    const result = await createInvoiceAction(null, validInvoiceFormData());

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/no encontrado/i);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns raw error message for unrecognised errors', async () => {
    vi.mocked(createInvoice).mockRejectedValue({
      message: 'Database connection failed',
    });

    const result = await createInvoiceAction(null, validInvoiceFormData());

    expect(result).toHaveProperty('error', 'Database connection failed');
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// recordPaymentAction (AR-T19)
// ---------------------------------------------------------------------------
describe('recordPaymentAction', () => {
  it('calls recordPayment with correct args and redirects on success', async () => {
    vi.mocked(recordPayment).mockResolvedValue(undefined);

    await recordPaymentAction(null, validPaymentFormData());

    expect(recordPayment).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        invoiceId: INVOICE_UUID,
        amount: 300,
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/invoices/${INVOICE_UUID}`);
    expect(redirect).toHaveBeenCalledWith(`/invoices/${INVOICE_UUID}`);
  });

  it('returns error state on OverpaymentError (no redirect)', async () => {
    vi.mocked(recordPayment).mockRejectedValue(
      new OverpaymentError('Payment exceeds outstanding balance: outstanding 200, attempted 300')
    );

    const result = await recordPaymentAction(null, validPaymentFormData());

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/excede|balance|pago/i);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns error state on CancelledOrderPaymentError (no redirect)', async () => {
    vi.mocked(recordPayment).mockRejectedValue(
      new CancelledOrderPaymentError('Cannot record payment on a cancelled order')
    );

    const result = await recordPaymentAction(null, validPaymentFormData());

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/cancelado/i);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns fieldErrors when amount=0 (Zod blocks before RPC call)', async () => {
    const fd = new FormData();
    fd.set('invoiceId', INVOICE_UUID);
    fd.set('amount', '0');

    const result = await recordPaymentAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(recordPayment).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns fieldErrors when invoiceId is not a valid UUID', async () => {
    const fd = new FormData();
    fd.set('invoiceId', 'not-uuid');
    fd.set('amount', '100');

    const result = await recordPaymentAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it('calls requireUser to guard the action', async () => {
    vi.mocked(recordPayment).mockResolvedValue(undefined);

    await recordPaymentAction(null, validPaymentFormData());

    expect(requireUser).toHaveBeenCalledOnce();
  });
});
