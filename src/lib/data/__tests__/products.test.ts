/**
 * Unit tests for adjustStock data layer wrapper — RPC conversion.
 *
 * Tests: adjustStock calls adjust_stock RPC; maps error.code '23514' to
 * StockUnderflowError; returns data as Product from rpc response.
 *
 * Covers: REQ-5 (adjust_stock data layer)
 */

import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { adjustStock, StockUnderflowError } from '@/lib/data/products';
import type { Product } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProduct: Product = {
  id: 'prod-1',
  tenant_id: 't-1',
  nombre: 'Widget',
  sku: null,
  categoria: null,
  precio_unitario: 10,
  stock_actual: 15,
  stock_minimo: 5,
  unidad_medida: null,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  units_per_package: null,
  precio_paca: null,
  cost_price: null,
  shelf_life_days: null,
  expiry_alert_days: 30,
  image_path: null,
  presentacion: null,
};

// ---------------------------------------------------------------------------
// adjustStock — RPC call
// ---------------------------------------------------------------------------
describe('adjustStock — RPC wrapper', () => {
  it('calls adjust_stock RPC with p_product_id and p_delta', async () => {
    let capturedArgs: Record<string, unknown> | null = null;

    const supabase = createMockSupabaseClient({
      rpcs: {
        adjust_stock: (args) => {
          capturedArgs = args;
          return { data: mockProduct, error: null };
        },
      },
    });

    await adjustStock(supabase, 'prod-1', 5);

    expect(capturedArgs).not.toBeNull();
    expect(capturedArgs!.p_product_id).toBe('prod-1');
    expect(capturedArgs!.p_delta).toBe(5);
  });

  it('calls adjust_stock with negative delta for stock removal', async () => {
    let capturedArgs: Record<string, unknown> | null = null;

    const supabase = createMockSupabaseClient({
      rpcs: {
        adjust_stock: (args) => {
          capturedArgs = args;
          return { data: mockProduct, error: null };
        },
      },
    });

    await adjustStock(supabase, 'prod-1', -3);

    expect(capturedArgs!.p_delta).toBe(-3);
  });

  it('returns the Product row from the RPC response (D7 — single round-trip)', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        adjust_stock: () => ({ data: mockProduct, error: null }),
      },
    });

    const result = await adjustStock(supabase, 'prod-1', 5);

    expect(result).toEqual(mockProduct);
    expect(result.stock_actual).toBe(15); // from mock fixture
  });

  it('maps error.code "23514" to StockUnderflowError (D6)', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        adjust_stock: () => ({
          data: null,
          error: { message: 'Stock cannot go below zero', code: '23514' },
        }),
      },
    });

    await expect(adjustStock(supabase, 'prod-1', -999)).rejects.toThrow(StockUnderflowError);
  });

  it('StockUnderflowError carries the productId', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        adjust_stock: () => ({
          data: null,
          error: { message: 'Stock cannot go below zero', code: '23514' },
        }),
      },
    });

    try {
      await adjustStock(supabase, 'target-product-id', -999);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(StockUnderflowError);
      expect((err as StockUnderflowError).productId).toBe('target-product-id');
    }
  });

  it('re-throws non-23514 errors as-is', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        adjust_stock: () => ({
          data: null,
          error: { message: 'Product not found', code: 'PGRST116' },
        }),
      },
    });

    await expect(adjustStock(supabase, 'prod-1', 5)).rejects.not.toBeInstanceOf(StockUnderflowError);
  });
});
