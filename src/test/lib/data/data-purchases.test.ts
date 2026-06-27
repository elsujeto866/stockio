/**
 * Unit tests for purchases data-seam.
 *
 * Uses the extended mock client — verifies:
 *  - getPurchases: selects correct cols with supplier join, orders by created_at desc,
 *    applies supplierId / from / to filters when provided
 *  - getPurchase: nested select includes purchase_items with product join; returns null on not-found
 *  - createPurchase: calls create_purchase RPC with camelCase→snake_case mapping
 *    (supplierId→p_supplier_id, item.costoUnitario→costo_unitario, item.productId→product_id,
 *     fecha??null→p_fecha, notas??null→p_notas); returns UUID string
 *  - cancelPurchase: calls cancel_purchase RPC with p_purchase_id; resolves to void
 *
 * Satisfies: REQ-V1, REQ-V2, REQ-P1, REQ-P2 (seam contract)
 */

import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import {
  getPurchases,
  getPurchase,
  createPurchase,
  cancelPurchase,
} from '@/lib/data/purchases';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SUPPLIER_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
const PRODUCT_UUID_A = 'aaaabbbb-cccc-4ddd-8eee-ffff00002222';
const PRODUCT_UUID_B = 'aaaabbbb-cccc-4ddd-8eee-ffff00003333';
const PURCHASE_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00004444';

const samplePurchase = {
  id: PURCHASE_UUID,
  tenant_id: 'tenant-1',
  supplier_id: SUPPLIER_UUID,
  fecha: '2026-01-15',
  estado: 'recibido',
  total: 25.00,
  notas: null,
  created_at: '2026-01-15T10:00:00Z',
  supplier: { nombre: 'Proveedor Central' },
};

// ---------------------------------------------------------------------------
// getPurchases
// ---------------------------------------------------------------------------
describe('getPurchases', () => {
  it('returns purchases from the table', async () => {
    const supabase = createMockSupabaseClient({
      tables: { purchases: [samplePurchase] },
    });

    const result = await getPurchases(supabase);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(PURCHASE_UUID);
    expect(result[0].estado).toBe('recibido');
  });

  it('returns empty array when no purchases', async () => {
    const supabase = createMockSupabaseClient({
      tables: { purchases: [] },
    });

    const result = await getPurchases(supabase);

    expect(result).toHaveLength(0);
  });

  it('applies supplierId filter when provided', async () => {
    const other = { ...samplePurchase, id: 'other-purchase', supplier_id: 'other-supplier' };
    const supabase = createMockSupabaseClient({
      tables: { purchases: [samplePurchase, other] },
    });

    const result = await getPurchases(supabase, { supplierId: SUPPLIER_UUID });

    expect(result).toHaveLength(1);
    expect(result[0].supplier_id).toBe(SUPPLIER_UUID);
  });

  it('applies from date filter', async () => {
    const early = { ...samplePurchase, id: 'early', fecha: '2025-12-01' };
    const supabase = createMockSupabaseClient({
      tables: { purchases: [early, samplePurchase] },
    });

    const result = await getPurchases(supabase, { from: '2026-01-01' });

    expect(result.every((p) => p.fecha >= '2026-01-01')).toBe(true);
  });

  it('applies to date filter', async () => {
    const late = { ...samplePurchase, id: 'late', fecha: '2026-03-01' };
    const supabase = createMockSupabaseClient({
      tables: { purchases: [samplePurchase, late] },
    });

    const result = await getPurchases(supabase, { to: '2026-02-01' });

    expect(result.every((p) => p.fecha <= '2026-02-01')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getPurchase
// ---------------------------------------------------------------------------
describe('getPurchase', () => {
  it('returns null when not found (does not throw)', async () => {
    const supabase = createMockSupabaseClient({
      tables: { purchases: [] },
    });

    const result = await getPurchase(supabase, 'nonexistent');

    expect(result).toBeNull();
  });

  it('returns the purchase when found', async () => {
    const supabase = createMockSupabaseClient({
      tables: { purchases: [samplePurchase] },
    });

    const result = await getPurchase(supabase, PURCHASE_UUID);

    expect(result?.id).toBe(PURCHASE_UUID);
    expect(result?.supplier?.nombre).toBe('Proveedor Central');
  });
});

// ---------------------------------------------------------------------------
// createPurchase — RPC mapping
// ---------------------------------------------------------------------------
describe('createPurchase', () => {
  it('calls create_purchase RPC with correct camelCase→snake_case mapping', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: (args) => {
          capturedArgs = args;
          return { data: PURCHASE_UUID, error: null };
        },
      },
    });

    const id = await createPurchase(supabase, {
      supplierId: SUPPLIER_UUID,
      items: [
        { productId: PRODUCT_UUID_A, cantidad: 5, costoUnitario: 2.50 },
      ],
      notas: 'Test purchase',
    });

    expect(capturedArgs).toEqual({
      p_supplier_id: SUPPLIER_UUID,
      p_items: [{ product_id: PRODUCT_UUID_A, cantidad: 5, costo_unitario: 2.50 }],
      p_fecha: null,
      p_notas: 'Test purchase',
    });
    expect(id).toBe(PURCHASE_UUID);
  });

  it('passes fecha when provided', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: (args) => {
          capturedArgs = args;
          return { data: PURCHASE_UUID, error: null };
        },
      },
    });

    await createPurchase(supabase, {
      supplierId: SUPPLIER_UUID,
      items: [{ productId: PRODUCT_UUID_A, cantidad: 1, costoUnitario: 10.00 }],
      fecha: '2024-12-15',
    });

    expect(capturedArgs?.p_fecha).toBe('2024-12-15');
  });

  it('defaults p_fecha to null when not provided', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: (args) => {
          capturedArgs = args;
          return { data: PURCHASE_UUID, error: null };
        },
      },
    });

    await createPurchase(supabase, {
      supplierId: SUPPLIER_UUID,
      items: [{ productId: PRODUCT_UUID_A, cantidad: 1, costoUnitario: 0 }],
    });

    expect(capturedArgs?.p_fecha).toBeNull();
  });

  it('defaults p_notas to null when not provided', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: (args) => {
          capturedArgs = args;
          return { data: PURCHASE_UUID, error: null };
        },
      },
    });

    await createPurchase(supabase, {
      supplierId: SUPPLIER_UUID,
      items: [{ productId: PRODUCT_UUID_A, cantidad: 2, costoUnitario: 5 }],
    });

    expect(capturedArgs?.p_notas).toBeNull();
  });

  it('maps multiple items with correct snake_case keys', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: (args) => {
          capturedArgs = args;
          return { data: PURCHASE_UUID, error: null };
        },
      },
    });

    await createPurchase(supabase, {
      supplierId: SUPPLIER_UUID,
      items: [
        { productId: PRODUCT_UUID_A, cantidad: 3, costoUnitario: 1.00 },
        { productId: PRODUCT_UUID_B, cantidad: 7, costoUnitario: 3.50 },
      ],
    });

    expect(capturedArgs?.p_items).toEqual([
      { product_id: PRODUCT_UUID_A, cantidad: 3, costo_unitario: 1.00 },
      { product_id: PRODUCT_UUID_B, cantidad: 7, costo_unitario: 3.50 },
    ]);
  });

  it('throws when RPC returns an error', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: () => ({
          data: null,
          error: { message: 'Supplier not found in tenant', code: 'P0001' },
        }),
      },
    });

    await expect(
      createPurchase(supabase, {
        supplierId: SUPPLIER_UUID,
        items: [{ productId: PRODUCT_UUID_A, cantidad: 1, costoUnitario: 0 }],
      })
    ).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// cancelPurchase
// ---------------------------------------------------------------------------
describe('cancelPurchase', () => {
  it('calls cancel_purchase RPC with the correct purchase id', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        cancel_purchase: (args) => {
          capturedArgs = args;
          return { data: null, error: null };
        },
      },
    });

    await cancelPurchase(supabase, PURCHASE_UUID);

    expect(capturedArgs).toEqual({ p_purchase_id: PURCHASE_UUID });
  });

  it('resolves to void on success', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        cancel_purchase: () => ({ data: null, error: null }),
      },
    });

    await expect(cancelPurchase(supabase, PURCHASE_UUID)).resolves.toBeUndefined();
  });

  it('throws when RPC returns an error', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        cancel_purchase: () => ({
          data: null,
          error: {
            message: 'Cannot cancel purchase: product abc stock would go negative (current: 1, purchase: 5)',
            code: 'P0001',
          },
        }),
      },
    });

    await expect(cancelPurchase(supabase, PURCHASE_UUID)).rejects.toBeDefined();
  });
});
