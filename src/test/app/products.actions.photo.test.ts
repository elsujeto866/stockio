/**
 * Unit tests for createProductAction — explicit id + image_path flow.
 *
 * PP-T14: REQ-1 (S1-1 data path); Design §6, D1.
 * Mocks createProduct spy; asserts explicit id and image_path forwarding.
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (before importing the module under test)
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
}));

const { createProductMock, updateProductMock } = vi.hoisted(() => ({
  createProductMock: vi.fn(),
  updateProductMock: vi.fn(),
}));

vi.mock('@/lib/data/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/products')>();
  return {
    ...actual,
    createProduct: createProductMock,
    updateProduct: updateProductMock,
  };
});

// next/navigation redirect/revalidatePath must be mocked
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { createProductAction } from '@/app/(app)/products/actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v);
  }
  return fd;
}

const baseFields = {
  nombre: 'Widget',
  precio_unitario: '10',
  stock_actual: '5',
  stock_minimo: '1',
};

beforeEach(() => {
  vi.clearAllMocks();
  createProductMock.mockResolvedValue({ id: 'new-id' });
});

// ---------------------------------------------------------------------------
// D1: explicit id forwarded from formData to createProduct
// ---------------------------------------------------------------------------
describe('createProductAction — explicit id (D1)', () => {
  it('forwards formData id to createProduct', async () => {
    const clientId = 'client-generated-uuid-123';
    const fd = makeFormData({ ...baseFields, id: clientId, image_path: '' });

    await createProductAction(null, fd).catch(() => {}); // redirect throws in test

    expect(createProductMock).toHaveBeenCalledWith(
      expect.anything(), // supabase client
      expect.objectContaining({ id: clientId })
    );
  });

  it('forwards image_path from formData through schema to createProduct', async () => {
    const clientId = 'uuid-456';
    const fd = makeFormData({
      ...baseFields,
      id: clientId,
      image_path: 't-1/uuid-456.jpg',
    });

    await createProductAction(null, fd).catch(() => {});

    expect(createProductMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ image_path: 't-1/uuid-456.jpg' })
    );
  });

  it('image_path becomes null when empty string in formData (schema transform)', async () => {
    const fd = makeFormData({
      ...baseFields,
      id: 'uuid-789',
      image_path: '',
    });

    await createProductAction(null, fd).catch(() => {});

    expect(createProductMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ image_path: null })
    );
  });

  it('image_path becomes null when absent from formData', async () => {
    const fd = makeFormData({ ...baseFields, id: 'uuid-abc' });

    await createProductAction(null, fd).catch(() => {});

    const passedInput = createProductMock.mock.calls[0]?.[1];
    expect(passedInput?.image_path ?? null).toBeNull();
  });
});
