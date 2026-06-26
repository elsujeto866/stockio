/**
 * Unit tests for order Server Actions (WU-B1).
 *
 * Verifies:
 *   createOrderAction — success redirect; Zod fieldErrors; bad JSON → error;
 *     insufficient-stock regex parse → insufficientStock payload;
 *     raw-msg fallback for unrecognised errors;
 *     requireUser is called.
 *   markDeliveredAction — calls markDelivered + revalidates + redirects.
 *   cancelOrderAction  — calls cancelOrder  + revalidates + redirects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/data/orders', () => ({
  createOrder: vi.fn(),
  markDelivered: vi.fn(),
  cancelOrder: vi.fn(),
}));

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { createOrder, markDelivered, cancelOrder } from '@/lib/data/orders';
import {
  createOrderAction,
  markDeliveredAction,
  cancelOrderAction,
} from '@/app/(app)/orders/actions';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const mockClient = {};
const mockUser = { id: 'user-1', email: 'test@example.com' } as User;

// RFC-compliant UUIDs for Zod v4 validation
const STORE_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
const PRODUCT_UUID_A = 'aaaabbbb-cccc-4ddd-8eee-ffff00002222';
const ORDER_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00003333';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(
    mockClient as Awaited<ReturnType<typeof createClient>>
  );
  vi.mocked(requireUser).mockResolvedValue(mockUser);
});

function validOrderFormData(): FormData {
  const fd = new FormData();
  fd.set('storeId', STORE_UUID);
  fd.set('items', JSON.stringify([{ productId: PRODUCT_UUID_A, cantidad: 2 }]));
  fd.set('notas', '');
  return fd;
}

// ---------------------------------------------------------------------------
// createOrderAction
// ---------------------------------------------------------------------------
describe('createOrderAction', () => {
  it('calls createOrder with parsed payload and redirects to /orders/[id] on success', async () => {
    vi.mocked(createOrder).mockResolvedValue(ORDER_UUID);

    await createOrderAction(null, validOrderFormData());

    expect(createOrder).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        storeId: STORE_UUID,
        items: [{ productId: PRODUCT_UUID_A, cantidad: 2 }],
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/orders');
    expect(redirect).toHaveBeenCalledWith(`/orders/${ORDER_UUID}`);
  });

  it('calls requireUser to guard the action', async () => {
    vi.mocked(createOrder).mockResolvedValue(ORDER_UUID);

    await createOrderAction(null, validOrderFormData());

    expect(requireUser).toHaveBeenCalledOnce();
  });

  it('returns fieldErrors when storeId is missing', async () => {
    const fd = new FormData();
    // storeId absent — items is a valid array
    fd.set('items', JSON.stringify([{ productId: PRODUCT_UUID_A, cantidad: 1 }]));

    const result = await createOrderAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(createOrder).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns fieldErrors when items array is empty', async () => {
    const fd = new FormData();
    fd.set('storeId', STORE_UUID);
    fd.set('items', JSON.stringify([]));

    const result = await createOrderAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('returns { error: "Invalid order items" } when items JSON is malformed', async () => {
    const fd = new FormData();
    fd.set('storeId', STORE_UUID);
    fd.set('items', 'not-json{{{');

    const result = await createOrderAction(null, fd);

    expect(result).toEqual({ error: 'Invalid order items' });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('returns insufficientStock when createOrder throws the RPC stock error (regex match)', async () => {
    vi.mocked(createOrder).mockRejectedValue(
      new Error(
        `Insufficient stock for product ${PRODUCT_UUID_A}: available 3, requested 10`
      )
    );

    const result = await createOrderAction(null, validOrderFormData());

    expect(result).toEqual({
      insufficientStock: {
        productId: PRODUCT_UUID_A,
        available: 3,
        requested: 10,
      },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns { error: msg } raw fallback when createOrder throws unrecognised error', async () => {
    vi.mocked(createOrder).mockRejectedValue(new Error('Store not found in tenant'));

    const result = await createOrderAction(null, validOrderFormData());

    expect(result).toHaveProperty('error', 'Store not found in tenant');
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markDeliveredAction
// ---------------------------------------------------------------------------
describe('markDeliveredAction', () => {
  it('calls markDelivered with the order id and revalidates + redirects', async () => {
    vi.mocked(markDelivered).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', ORDER_UUID);

    await markDeliveredAction(fd);

    expect(markDelivered).toHaveBeenCalledWith(mockClient, ORDER_UUID);
    expect(revalidatePath).toHaveBeenCalledWith('/orders');
    expect(revalidatePath).toHaveBeenCalledWith(`/orders/${ORDER_UUID}`);
    expect(redirect).toHaveBeenCalledWith(`/orders/${ORDER_UUID}`);
  });

  it('does nothing when id is missing', async () => {
    const fd = new FormData();
    // id not set

    await markDeliveredAction(fd);

    expect(markDelivered).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cancelOrderAction
// ---------------------------------------------------------------------------
describe('cancelOrderAction', () => {
  it('calls cancelOrder with the order id and revalidates + redirects', async () => {
    vi.mocked(cancelOrder).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', ORDER_UUID);

    await cancelOrderAction(fd);

    expect(cancelOrder).toHaveBeenCalledWith(mockClient, ORDER_UUID);
    expect(revalidatePath).toHaveBeenCalledWith('/orders');
    expect(revalidatePath).toHaveBeenCalledWith(`/orders/${ORDER_UUID}`);
    expect(redirect).toHaveBeenCalledWith(`/orders/${ORDER_UUID}`);
  });

  it('does nothing when id is missing', async () => {
    const fd = new FormData();

    await cancelOrderAction(fd);

    expect(cancelOrder).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
