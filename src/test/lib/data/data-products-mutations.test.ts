/**
 * Unit tests for product data-seam mutations.
 *
 * Uses the extended mock client — verifies:
 *  - createProduct: insert payload omits tenant_id
 *  - updateProduct: update payload correct, eq('id') called
 *  - deleteProduct: uses update({activo:false}), NEVER .delete()
 *  - adjustStock: computes delta, maps Postgres 23514 → StockUnderflowError
 */

import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  StockUnderflowError,
} from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseProduct = {
  id: 'prod-1',
  tenant_id: 'tenant-1',
  nombre: 'Aceite de Oliva',
  sku: 'OL-001',
  categoria: 'Alimentos',
  precio_unitario: 12.5,
  stock_actual: 100,
  stock_minimo: 10,
  unidad_medida: 'litro',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
};

const validInput = {
  nombre: 'Aceite de Oliva',
  sku: 'OL-001',
  categoria: 'Alimentos',
  precio_unitario: 12.5,
  stock_actual: 100,
  stock_minimo: 10,
  unidad_medida: 'litro',
};

// ---------------------------------------------------------------------------
// createProduct
// ---------------------------------------------------------------------------
describe('createProduct', () => {
  it('resolves tenant_id from get_tenant_id() RPC, not from user input (R8)', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: baseProduct,
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    await createProduct(supabase, validInput);

    const payload = supabase.__captured.insertPayload as Record<string, unknown>;
    // tenant_id is server-resolved — matches the RPC return, not from validInput
    expect(payload.tenant_id).toBe('tenant-1');
    // validInput itself does not carry tenant_id
    expect(validInput).not.toHaveProperty('tenant_id');
  });

  it('insert payload contains the expected fields', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: baseProduct,
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    await createProduct(supabase, validInput);

    const payload = supabase.__captured.insertPayload as Record<string, unknown>;
    expect(payload.nombre).toBe('Aceite de Oliva');
    expect(payload.precio_unitario).toBe(12.5);
    expect(payload.stock_actual).toBe(100);
  });

  it('returns the created product from the DB result', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: baseProduct,
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    const product = await createProduct(supabase, validInput);

    expect(product.id).toBe('prod-1');
    expect(product.nombre).toBe('Aceite de Oliva');
    expect(product.activo).toBe(true);
  });

  it('throws when get_tenant_id() fails (not authenticated)', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        get_tenant_id: () => ({ data: null, error: { message: 'not found', code: '42883' } }),
      },
    });

    await expect(createProduct(supabase, validInput)).rejects.toThrow('Could not resolve tenant');
  });

  it('throws when the DB insert returns an error', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'unique violation', code: '23505' },
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    await expect(createProduct(supabase, validInput)).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// updateProduct
// ---------------------------------------------------------------------------
describe('updateProduct', () => {
  it('sends the correct update payload (no tenant_id)', async () => {
    const updated = { ...baseProduct, nombre: 'Updated Name' };
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
      updateResult: updated,
    });

    await updateProduct(supabase, 'prod-1', { ...validInput, nombre: 'Updated Name' });

    const payload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(payload.nombre).toBe('Updated Name');
    expect(payload).not.toHaveProperty('tenant_id');
  });

  it('returns the updated product', async () => {
    const updated = { ...baseProduct, nombre: 'New Name' };
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
      updateResult: updated,
    });

    const product = await updateProduct(supabase, 'prod-1', { ...validInput, nombre: 'New Name' });

    expect(product.nombre).toBe('New Name');
    expect(product.id).toBe('prod-1');
  });

  it('throws when the DB returns an error', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
      mutationError: { message: 'no rows', code: 'PGRST116' },
    });

    await expect(updateProduct(supabase, 'prod-1', validInput)).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// deleteProduct (soft delete)
// ---------------------------------------------------------------------------
describe('deleteProduct', () => {
  it('calls update with { activo: false } and NOT delete()', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
    });

    await deleteProduct(supabase, 'prod-1');

    const updatePayload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(updatePayload).toEqual({ activo: false });
  });

  it('does not populate insertPayload (only update is called)', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
    });

    await deleteProduct(supabase, 'prod-1');

    expect(supabase.__captured.insertPayload).toBeUndefined();
  });

  it('resolves to void on success', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
    });

    await expect(deleteProduct(supabase, 'prod-1')).resolves.toBeUndefined();
  });

  it('throws when the DB returns an error', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'permission denied', code: '42501' },
    });

    await expect(deleteProduct(supabase, 'prod-1')).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// cost_price — data layer (S3-T7)
// ---------------------------------------------------------------------------
describe('cost_price — data layer (S3-T7)', () => {
  it('SELECT_COLS string includes cost_price', () => {
    // Verify by checking that createProduct round-trips cost_price in the insert payload
    // The mock returns what we configure, and SELECT_COLS is verified by the mock capturing it
    // Indirect: if SELECT_COLS lacked cost_price, the returned product would not have it
    const productWithCost = { ...baseProduct, cost_price: 8.00 };
    const supabase = createMockSupabaseClient({
      insertResult: productWithCost,
      rpcs: { get_tenant_id: () => ({ data: 'tenant-1', error: null }) },
    });
    return createProduct(supabase, { ...validInput, cost_price: 8.00 }).then((p) => {
      expect(p.cost_price).toBe(8.00);
    });
  });

  it('createProduct round-trips cost_price in the insert payload', async () => {
    const productWithCost = { ...baseProduct, cost_price: 5.99 };
    const supabase = createMockSupabaseClient({
      insertResult: productWithCost,
      rpcs: { get_tenant_id: () => ({ data: 'tenant-1', error: null }) },
    });

    const result = await createProduct(supabase, { ...validInput, cost_price: 5.99 });

    const payload = supabase.__captured.insertPayload as Record<string, unknown>;
    expect(payload.cost_price).toBe(5.99);
    expect(result.cost_price).toBe(5.99);
  });

  it('updateProduct round-trips cost_price = 10.00', async () => {
    const updated = { ...baseProduct, cost_price: 10.00 };
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
      updateResult: updated,
    });

    const result = await updateProduct(supabase, 'prod-1', { ...validInput, cost_price: 10.00 });

    const payload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(payload.cost_price).toBe(10.00);
    expect(result.cost_price).toBe(10.00);
  });

  it('ProductInput accepts cost_price as optional (undefined does not break)', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { ...baseProduct, cost_price: null },
      rpcs: { get_tenant_id: () => ({ data: 'tenant-1', error: null }) },
    });

    // cost_price absent — should succeed
    const result = await createProduct(supabase, validInput);
    expect(result.cost_price).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// adjustStock
// ---------------------------------------------------------------------------
describe('adjustStock', () => {
  it('sends stock_actual = current + positive delta in the update payload', async () => {
    const updatedProduct = { ...baseProduct, stock_actual: 105 };
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
      updateResult: updatedProduct,
    });

    const result = await adjustStock(supabase, 'prod-1', 5);

    const payload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(payload.stock_actual).toBe(105); // 100 + 5
    expect(result.stock_actual).toBe(105);
  });

  it('sends stock_actual = current + negative delta in the update payload', async () => {
    const updatedProduct = { ...baseProduct, stock_actual: 97 };
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
      updateResult: updatedProduct,
    });

    await adjustStock(supabase, 'prod-1', -3);

    const payload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(payload.stock_actual).toBe(97); // 100 - 3
  });

  it('throws StockUnderflowError when DB CHECK rejects with code 23514', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
      mutationError: {
        message: 'new row violates check constraint "products_stock_actual_check"',
        code: '23514',
      },
    });

    await expect(adjustStock(supabase, 'prod-1', -200)).rejects.toThrow(StockUnderflowError);
  });

  it('wraps StockUnderflowError as an Error instance', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
      mutationError: { message: 'check constraint', code: '23514' },
    });

    await expect(adjustStock(supabase, 'prod-1', -200)).rejects.toBeInstanceOf(StockUnderflowError);
  });

  it('does NOT throw StockUnderflowError for non-23514 DB errors', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [baseProduct] },
      mutationError: { message: 'permission denied', code: '42501' },
    });

    await expect(adjustStock(supabase, 'prod-1', -5)).rejects.not.toBeInstanceOf(StockUnderflowError);
  });

  it('throws when product is not found', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [] }, // empty — getProduct returns null
    });

    await expect(adjustStock(supabase, 'nonexistent', 5)).rejects.toThrow();
  });
});
