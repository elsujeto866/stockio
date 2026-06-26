/**
 * Unit tests for the new orders data-seam additions (WU-A):
 *   - getOrder: nested fixture passthrough, null on missing row
 *   - getOrders: optional storeId / from / to filters
 *   - markDelivered: success resolves void; failure throws OrderNotDeliverableError
 *
 * Does NOT duplicate coverage from src/test/data-orders.test.ts (createOrder,
 * cancelOrder, nextInvoiceNumber, basic getOrders) or rpcs.test.ts
 * (oversell, price-freeze, cancel+stock-restore).
 */

import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { getOrder, getOrders, markDelivered, OrderNotDeliverableError } from '@/lib/data/orders';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  tenant_id: 'tenant-1',
  store_id: 'store-1',
  fecha: '2026-01-10',
  estado: 'pendiente',
  total: null,
  notas: null,
  created_at: '2026-01-10T00:00:00Z',
  ...overrides,
});

/** Pre-nested fixture mimicking PostgREST nested select response */
const nestedOrderFixture = {
  id: 'order-detail-1',
  tenant_id: 'tenant-1',
  store_id: 'store-1',
  fecha: '2026-01-10',
  estado: 'pendiente' as const,
  total: 50.00,
  notas: 'Test order',
  created_at: '2026-01-10T00:00:00Z',
  store: { nombre: 'Store Alpha' },
  items: [
    {
      id: 'item-1',
      product_id: 'prod-1',
      cantidad: 2,
      precio_unitario: 25.00,
      subtotal: 50.00,
      product: { nombre: 'Widget X' },
    },
  ],
};

// ---------------------------------------------------------------------------
// getOrder
// ---------------------------------------------------------------------------
describe('getOrder', () => {
  it('returns the order with nested store and items when row exists', async () => {
    const supabase = createMockSupabaseClient({
      tables: { orders: [nestedOrderFixture] },
    });

    const result = await getOrder(supabase, 'order-detail-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('order-detail-1');
    expect(result?.store?.nombre).toBe('Store Alpha');
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].product?.nombre).toBe('Widget X');
    expect(result?.items[0].precio_unitario).toBe(25.00);
    expect(result?.items[0].subtotal).toBe(50.00);
    expect(result?.total).toBe(50.00);
  });

  it('returns null when the order is not found (eq filter returns no rows)', async () => {
    const supabase = createMockSupabaseClient({
      tables: { orders: [nestedOrderFixture] },
    });

    const result = await getOrder(supabase, 'non-existent-id');

    expect(result).toBeNull();
  });

  it('returns null when the orders table is empty', async () => {
    const supabase = createMockSupabaseClient({
      tables: { orders: [] },
    });

    const result = await getOrder(supabase, 'any-id');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getOrders — filter variants
// ---------------------------------------------------------------------------
describe('getOrders — filters', () => {
  const orders = [
    makeOrder({ id: 'o1', store_id: 'store-1', fecha: '2026-01-10' }),
    makeOrder({ id: 'o2', store_id: 'store-2', fecha: '2026-01-15' }),
    makeOrder({ id: 'o3', store_id: 'store-1', fecha: '2026-01-20' }),
  ];

  it('returns all orders when no options are provided (backward-compatible)', async () => {
    const supabase = createMockSupabaseClient({ tables: { orders } });

    const result = await getOrders(supabase);

    expect(result).toHaveLength(3);
  });

  it('filters by storeId when provided (eq applied)', async () => {
    const supabase = createMockSupabaseClient({ tables: { orders } });

    const result = await getOrders(supabase, { storeId: 'store-1' });

    expect(result).toHaveLength(2);
    expect(result.every((o) => o.store_id === 'store-1')).toBe(true);
  });

  it('filters by from date using gte', async () => {
    const supabase = createMockSupabaseClient({ tables: { orders } });

    const result = await getOrders(supabase, { from: '2026-01-12' });

    // o2 (Jan 15) and o3 (Jan 20) qualify; o1 (Jan 10) does not
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.id).sort()).toEqual(['o2', 'o3']);
  });

  it('filters by to date using lte', async () => {
    const supabase = createMockSupabaseClient({ tables: { orders } });

    const result = await getOrders(supabase, { to: '2026-01-14' });

    // Only o1 (Jan 10) qualifies
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('o1');
  });

  it('applies both from and to when both are provided', async () => {
    const supabase = createMockSupabaseClient({ tables: { orders } });

    const result = await getOrders(supabase, { from: '2026-01-12', to: '2026-01-16' });

    // Only o2 (Jan 15) is in [Jan 12, Jan 16]
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('o2');
  });

  it('combines storeId and date filters', async () => {
    const supabase = createMockSupabaseClient({ tables: { orders } });

    const result = await getOrders(supabase, { storeId: 'store-1', from: '2026-01-15' });

    // store-1 orders with fecha >= Jan 15: only o3 (Jan 20)
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('o3');
  });
});

// ---------------------------------------------------------------------------
// markDelivered
// ---------------------------------------------------------------------------
describe('markDelivered', () => {
  it('resolves void when the conditional UPDATE returns a row', async () => {
    const supabase = createMockSupabaseClient({
      // updateResult simulates the UPDATE ... SELECT 'id' returning one row
      updateResult: { id: 'order-1' },
    });

    await expect(markDelivered(supabase, 'order-1')).resolves.toBeUndefined();
  });

  it('throws OrderNotDeliverableError when the UPDATE returns an error', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'no rows found', code: 'PGRST116' },
    });

    await expect(markDelivered(supabase, 'order-1')).rejects.toThrow(OrderNotDeliverableError);
  });

  it('thrown error carries the orderId', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'no rows', code: 'PGRST116' },
    });

    try {
      await markDelivered(supabase, 'target-order-id');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(OrderNotDeliverableError);
      expect((err as OrderNotDeliverableError).orderId).toBe('target-order-id');
    }
  });
});
