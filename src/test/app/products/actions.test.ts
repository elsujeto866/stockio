/**
 * Unit tests for product Server Actions.
 *
 * All logic lives in the seam/schema/domain layers (already tested).
 * These tests verify the action wire-up:
 *   parse → seam call → revalidatePath → redirect
 *   invalid parse → fieldErrors returned
 *   StockUnderflowError → human-readable error message
 *
 * Mocks: next/navigation, next/cache, @/lib/supabase/server,
 *        @/lib/auth/get-user, @/lib/data/products (functions only;
 *        StockUnderflowError class is preserved via importOriginal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock calls are hoisted before imports — must appear before any import.
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/data/products', async (importOriginal) => {
  // Keep StockUnderflowError real so instanceof checks in actions work.
  const actual = await importOriginal<typeof import('@/lib/data/products')>();
  return {
    ...actual,
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    adjustStock: vi.fn(),
  };
});

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  StockUnderflowError,
} from '@/lib/data/products';
import {
  createProductAction,
  updateProductAction,
  deleteProductAction,
  adjustStockAction,
} from '@/app/(app)/products/actions';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const mockClient = {};
const mockUser = { id: 'user-1', email: 'test@example.com' } as User;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(
    mockClient as Awaited<ReturnType<typeof createClient>>
  );
  vi.mocked(requireUser).mockResolvedValue(mockUser);
});

function validProductFormData(): FormData {
  const fd = new FormData();
  fd.set('nombre', 'Aceite de Oliva');
  fd.set('precio_unitario', '9.99');
  fd.set('stock_actual', '10');
  fd.set('stock_minimo', '5');
  return fd;
}

// ---------------------------------------------------------------------------
// createProductAction
// ---------------------------------------------------------------------------
describe('createProductAction', () => {
  it('returns fieldErrors when required fields are missing', async () => {
    const fd = new FormData();
    // nombre absent → Zod rejects

    const result = await createProductAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(createProduct).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('calls createProduct with coerced data and redirects on success', async () => {
    vi.mocked(createProduct).mockResolvedValue({} as never);

    const fd = validProductFormData();
    await createProductAction(null, fd);

    expect(createProduct).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        nombre: 'Aceite de Oliva',
        precio_unitario: 9.99,
        stock_actual: 10,
        stock_minimo: 5,
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/products');
    expect(redirect).toHaveBeenCalledWith('/products');
  });

  it('returns error when seam throws', async () => {
    vi.mocked(createProduct).mockRejectedValue(new Error('DB error'));

    const result = await createProductAction(null, validProductFormData());

    expect(result).toHaveProperty('error', 'DB error');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('surfaces real Postgres error message from a plain PostgrestError object', async () => {
    vi.mocked(createProduct).mockRejectedValue({
      message: 'duplicate key value violates unique constraint "products_nombre_key"',
      code: '23505',
    });

    const result = await createProductAction(null, validProductFormData());

    expect(result).toHaveProperty(
      'error',
      'duplicate key value violates unique constraint "products_nombre_key"'
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it('calls requireUser to guard the action', async () => {
    vi.mocked(createProduct).mockResolvedValue({} as never);

    await createProductAction(null, validProductFormData());

    expect(requireUser).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// cost_price round-trip in actions (S3-T9)
// ---------------------------------------------------------------------------
describe('createProductAction — cost_price (S3-T9)', () => {
  it('passes cost_price = 5.50 from FormData to createProduct', async () => {
    vi.mocked(createProduct).mockResolvedValue({} as never);

    const fd = validProductFormData();
    fd.set('cost_price', '5.50');
    await createProductAction(null, fd);

    expect(createProduct).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ cost_price: 5.5 })
    );
  });

  it('passes cost_price = null when form field is blank (empty → null via emptyToNull)', async () => {
    vi.mocked(createProduct).mockResolvedValue({} as never);

    const fd = validProductFormData();
    fd.set('cost_price', '');
    await createProductAction(null, fd);

    expect(createProduct).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ cost_price: null })
    );
  });

  it('returns fieldErrors.cost_price when cost_price is negative', async () => {
    const fd = validProductFormData();
    fd.set('cost_price', '-1');

    const result = await createProductAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect((result as { fieldErrors: Record<string, string[]> }).fieldErrors).toHaveProperty('cost_price');
    expect(createProduct).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateProductAction
// ---------------------------------------------------------------------------
describe('updateProductAction', () => {
  it('returns error when product id is missing', async () => {
    const fd = validProductFormData();
    // no id field

    const result = await updateProductAction(null, fd);

    expect(result).toHaveProperty('error');
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('returns fieldErrors for invalid data', async () => {
    const fd = new FormData();
    fd.set('id', 'prod-1');
    // nombre missing

    const result = await updateProductAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('calls updateProduct with id + parsed data, then redirects', async () => {
    vi.mocked(updateProduct).mockResolvedValue({} as never);

    const fd = validProductFormData();
    fd.set('id', 'prod-1');
    fd.set('nombre', 'Updated Name');

    await updateProductAction(null, fd);

    expect(updateProduct).toHaveBeenCalledWith(
      mockClient,
      'prod-1',
      expect.objectContaining({ nombre: 'Updated Name' })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/products');
    expect(redirect).toHaveBeenCalledWith('/products');
  });

  it('returns error when seam throws', async () => {
    vi.mocked(updateProduct).mockRejectedValue(new Error('not found'));

    const fd = validProductFormData();
    fd.set('id', 'prod-1');

    const result = await updateProductAction(null, fd);

    expect(result).toHaveProperty('error', 'not found');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('surfaces real Postgres error message from a plain PostgrestError object', async () => {
    vi.mocked(updateProduct).mockRejectedValue({
      message: 'violates check constraint "products_precio_unitario_check"',
      code: '23514',
    });

    const fd = validProductFormData();
    fd.set('id', 'prod-1');

    const result = await updateProductAction(null, fd);

    expect(result).toHaveProperty(
      'error',
      'violates check constraint "products_precio_unitario_check"'
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteProductAction
// ---------------------------------------------------------------------------
describe('deleteProductAction', () => {
  it('calls deleteProduct (soft-delete seam) with the given id', async () => {
    vi.mocked(deleteProduct).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', 'prod-1');

    await deleteProductAction(fd);

    expect(deleteProduct).toHaveBeenCalledWith(mockClient, 'prod-1');
  });

  it('revalidates and redirects after delete', async () => {
    vi.mocked(deleteProduct).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', 'prod-1');

    await deleteProductAction(fd);

    expect(revalidatePath).toHaveBeenCalledWith('/products');
    expect(redirect).toHaveBeenCalledWith('/products');
  });
});

// ---------------------------------------------------------------------------
// adjustStockAction
// ---------------------------------------------------------------------------
describe('adjustStockAction', () => {
  it('returns error when productId is missing', async () => {
    const fd = new FormData();
    fd.set('delta', '5');

    const result = await adjustStockAction(null, fd);

    expect(result).toHaveProperty('error');
    expect(adjustStock).not.toHaveBeenCalled();
  });

  it('returns fieldErrors when delta is not a valid integer', async () => {
    const fd = new FormData();
    fd.set('productId', 'prod-1');
    fd.set('delta', 'not-a-number');

    const result = await adjustStockAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(adjustStock).not.toHaveBeenCalled();
  });

  it('calls adjustStock with coerced delta and redirects on success', async () => {
    vi.mocked(adjustStock).mockResolvedValue({} as never);

    const fd = new FormData();
    fd.set('productId', 'prod-1');
    fd.set('delta', '5');

    await adjustStockAction(null, fd);

    expect(adjustStock).toHaveBeenCalledWith(mockClient, 'prod-1', 5);
    expect(revalidatePath).toHaveBeenCalledWith('/products');
    expect(redirect).toHaveBeenCalledWith('/products');
  });

  it('maps StockUnderflowError → { error: "El stock no puede ser negativo" }', async () => {
    vi.mocked(adjustStock).mockRejectedValue(new StockUnderflowError('prod-1'));

    const fd = new FormData();
    fd.set('productId', 'prod-1');
    fd.set('delta', '-100');

    const result = await adjustStockAction(null, fd);

    expect(result).toEqual({ error: 'El stock no puede ser negativo' });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns generic error for non-StockUnderflow seam errors', async () => {
    vi.mocked(adjustStock).mockRejectedValue(new Error('connection lost'));

    const fd = new FormData();
    fd.set('productId', 'prod-1');
    fd.set('delta', '5');

    const result = await adjustStockAction(null, fd);

    expect(result).toHaveProperty('error', 'connection lost');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('surfaces real Postgres error message from a plain PostgrestError object', async () => {
    vi.mocked(adjustStock).mockRejectedValue({
      message: 'stock_actual cannot be negative',
      code: '23514',
    });

    const fd = new FormData();
    fd.set('productId', 'prod-1');
    fd.set('delta', '-999');

    const result = await adjustStockAction(null, fd);

    expect(result).toHaveProperty('error', 'stock_actual cannot be negative');
    expect(redirect).not.toHaveBeenCalled();
  });
});
