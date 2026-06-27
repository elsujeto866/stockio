/**
 * Unit tests for purchases Server Actions.
 *
 * Verifies:
 *   createPurchaseAction — success: calls createPurchase + revalidatePath + redirect to /purchases/{id};
 *     malformed JSON items → { error: 'Invalid purchase items' }, no seam call;
 *     supplierId not UUID → { fieldErrors: { supplierId: [...] } };
 *     items empty array → { fieldErrors: { items: [...] } };
 *   cancelPurchaseAction (useActionState signature _prev, formData):
 *     success → revalidatePath /purchases and /purchases/{id}, then redirect /purchases/{id};
 *     error matching negative-stock regex → { negativeStock: { productId, current, cantidad } };
 *     non-matching error → { error: err.message }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/data/purchases', () => ({
  createPurchase: vi.fn(),
  cancelPurchase: vi.fn(),
}));

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { createPurchase, cancelPurchase } from '@/lib/data/purchases';
import {
  createPurchaseAction,
  cancelPurchaseAction,
} from '@/app/(app)/purchases/actions';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const mockClient = {};
const mockUser = { id: 'user-1', email: 'test@example.com' } as User;

// RFC-compliant UUIDs for Zod v4 validation
const SUPPLIER_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
const PRODUCT_UUID  = 'aaaabbbb-cccc-4ddd-8eee-ffff00002222';
const PURCHASE_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00004444';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(
    mockClient as Awaited<ReturnType<typeof createClient>>
  );
  vi.mocked(requireUser).mockResolvedValue(mockUser);
});

function validPurchaseFormData(): FormData {
  const fd = new FormData();
  fd.set('supplierId', SUPPLIER_UUID);
  fd.set(
    'items',
    JSON.stringify([{ productId: PRODUCT_UUID, cantidad: 5, costoUnitario: 2.50 }])
  );
  return fd;
}

// ---------------------------------------------------------------------------
// createPurchaseAction
// ---------------------------------------------------------------------------
describe('createPurchaseAction', () => {
  it('calls createPurchase, revalidates /purchases, redirects to /purchases/{id}', async () => {
    vi.mocked(createPurchase).mockResolvedValue(PURCHASE_UUID);

    await createPurchaseAction(null, validPurchaseFormData());

    expect(createPurchase).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        supplierId: SUPPLIER_UUID,
        items: [{ productId: PRODUCT_UUID, cantidad: 5, costoUnitario: 2.50 }],
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/purchases');
    expect(redirect).toHaveBeenCalledWith(`/purchases/${PURCHASE_UUID}`);
  });

  it('calls requireUser to guard the action', async () => {
    vi.mocked(createPurchase).mockResolvedValue(PURCHASE_UUID);

    await createPurchaseAction(null, validPurchaseFormData());

    expect(requireUser).toHaveBeenCalledOnce();
  });

  it('returns { error: "Invalid purchase items" } when items JSON is malformed', async () => {
    const fd = new FormData();
    fd.set('supplierId', SUPPLIER_UUID);
    fd.set('items', 'not-json{{{');

    const result = await createPurchaseAction(null, fd);

    expect(result).toEqual({ error: 'Invalid purchase items' });
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it('returns fieldErrors when supplierId is not a valid UUID', async () => {
    const fd = new FormData();
    fd.set('supplierId', 'not-a-uuid');
    fd.set(
      'items',
      JSON.stringify([{ productId: PRODUCT_UUID, cantidad: 1, costoUnitario: 0 }])
    );

    const result = await createPurchaseAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(result?.fieldErrors?.supplierId).toBeDefined();
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it('returns fieldErrors when items array is empty', async () => {
    const fd = new FormData();
    fd.set('supplierId', SUPPLIER_UUID);
    fd.set('items', JSON.stringify([]));

    const result = await createPurchaseAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(result?.fieldErrors?.items).toBeDefined();
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it('returns { error: msg } when createPurchase throws an unrecognised error', async () => {
    vi.mocked(createPurchase).mockRejectedValue(new Error('Supplier not found in tenant'));

    const result = await createPurchaseAction(null, validPurchaseFormData());

    expect(result).toHaveProperty('error', 'Supplier not found in tenant');
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cancelPurchaseAction
// ---------------------------------------------------------------------------
describe('cancelPurchaseAction', () => {
  it('revalidates /purchases and /purchases/{id}, then redirects on success', async () => {
    vi.mocked(cancelPurchase).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', PURCHASE_UUID);

    await cancelPurchaseAction(null, fd);

    expect(cancelPurchase).toHaveBeenCalledWith(mockClient, PURCHASE_UUID);
    expect(revalidatePath).toHaveBeenCalledWith('/purchases');
    expect(revalidatePath).toHaveBeenCalledWith(`/purchases/${PURCHASE_UUID}`);
    expect(redirect).toHaveBeenCalledWith(`/purchases/${PURCHASE_UUID}`);
  });

  it('returns { negativeStock } when error matches domain regex', async () => {
    vi.mocked(cancelPurchase).mockRejectedValue(
      new Error(
        `Cannot cancel purchase: product ${PRODUCT_UUID} stock would go negative (current: 2, purchase: 5)`
      )
    );

    const fd = new FormData();
    fd.set('id', PURCHASE_UUID);

    const result = await cancelPurchaseAction(null, fd);

    expect(result).toEqual({
      negativeStock: {
        productId: PRODUCT_UUID,
        current: 2,
        cantidad: 5,
      },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns { error: msg } when cancelPurchase throws an unrecognised error', async () => {
    vi.mocked(cancelPurchase).mockRejectedValue(
      new Error('Only received purchases can be cancelled (current estado: cancelado)')
    );

    const fd = new FormData();
    fd.set('id', PURCHASE_UUID);

    const result = await cancelPurchaseAction(null, fd);

    expect(result).toHaveProperty('error');
    expect(result?.error).toContain('Only received purchases');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('does nothing when id is missing', async () => {
    const fd = new FormData();

    const result = await cancelPurchaseAction(null, fd);

    expect(cancelPurchase).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    // Should return null or early exit without error
    expect(result).toBeNull();
  });
});
