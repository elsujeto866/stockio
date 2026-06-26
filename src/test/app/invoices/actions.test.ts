/**
 * Unit tests for invoice Server Actions.
 *
 * Verifies:
 *   createInvoiceAction — success redirect; Zod fieldErrors;
 *     "Cancelled orders cannot be invoiced" → friendly error;
 *     "Invoice already exists" → friendly error;
 *     "not found" → friendly error;
 *     requireUser is called.
 *   setPaymentStatusAction — calls setInvoicePaymentStatus + revalidates + redirects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/data/invoices', () => ({
  createInvoice: vi.fn(),
  setInvoicePaymentStatus: vi.fn(),
}));

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { createInvoice, setInvoicePaymentStatus } from '@/lib/data/invoices';
import {
  createInvoiceAction,
  setPaymentStatusAction,
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
    // orderId not set

    const result = await createInvoiceAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('returns friendly error when order is cancelled (Postgrest plain object, not Error)', async () => {
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
// setPaymentStatusAction
// ---------------------------------------------------------------------------
describe('setPaymentStatusAction', () => {
  it('calls setInvoicePaymentStatus with pagado and redirects', async () => {
    vi.mocked(setInvoicePaymentStatus).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', INVOICE_UUID);
    fd.set('estado', 'pagado');

    await setPaymentStatusAction(fd);

    expect(setInvoicePaymentStatus).toHaveBeenCalledWith(mockClient, INVOICE_UUID, 'pagado');
    expect(revalidatePath).toHaveBeenCalledWith(`/invoices/${INVOICE_UUID}`);
    expect(redirect).toHaveBeenCalledWith(`/invoices/${INVOICE_UUID}`);
  });

  it('calls setInvoicePaymentStatus with pendiente', async () => {
    vi.mocked(setInvoicePaymentStatus).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', INVOICE_UUID);
    fd.set('estado', 'pendiente');

    await setPaymentStatusAction(fd);

    expect(setInvoicePaymentStatus).toHaveBeenCalledWith(mockClient, INVOICE_UUID, 'pendiente');
  });

  it('calls setInvoicePaymentStatus with null when estado is not set', async () => {
    vi.mocked(setInvoicePaymentStatus).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', INVOICE_UUID);
    // estado not set → formData.get returns null → treated as null

    await setPaymentStatusAction(fd);

    expect(setInvoicePaymentStatus).toHaveBeenCalledWith(mockClient, INVOICE_UUID, null);
  });
});
