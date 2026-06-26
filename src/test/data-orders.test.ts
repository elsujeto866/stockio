import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { getOrders, createOrder, cancelOrder, nextInvoiceNumber } from '@/lib/data/orders';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const sampleOrder = {
  id: 'order-1',
  tenant_id: 'tenant-1',
  store_id: 'store-1',
  fecha: '2026-01-01',
  estado: 'pendiente',
  total: null,
  notas: null,
  created_at: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// getOrders
// ---------------------------------------------------------------------------
describe('getOrders', () => {
  it('returns all orders from the mock table', async () => {
    const supabase = createMockSupabaseClient({ tables: { orders: [sampleOrder] } });

    const orders = await getOrders(supabase);

    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe('order-1');
    expect(orders[0].estado).toBe('pendiente');
  });

  it('returns an empty array when there are no orders', async () => {
    const supabase = createMockSupabaseClient({ tables: { orders: [] } });
    const orders = await getOrders(supabase);
    expect(orders).toHaveLength(0);
  });

  it('returns at most limit rows when limit option is provided', async () => {
    const manyOrders = Array.from({ length: 10 }, (_, i) => ({
      ...sampleOrder,
      id: `order-${i + 1}`,
      created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
    }));
    const supabase = createMockSupabaseClient({ tables: { orders: manyOrders } });

    const orders = await getOrders(supabase, { limit: 3 });

    expect(orders).toHaveLength(3);
  });

  it('returns all orders when limit is not provided (backward-compatible)', async () => {
    const manyOrders = Array.from({ length: 4 }, (_, i) => ({
      ...sampleOrder,
      id: `order-${i + 1}`,
    }));
    const supabase = createMockSupabaseClient({ tables: { orders: manyOrders } });

    const orders = await getOrders(supabase);

    expect(orders).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// createOrder
// ---------------------------------------------------------------------------
describe('createOrder', () => {
  it('calls create_order RPC with the correct mapped arguments', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_order: (args) => {
          capturedArgs = args;
          return { data: 'new-order-uuid', error: null };
        },
      },
    });

    const orderId = await createOrder(supabase, {
      storeId: 'store-1',
      items: [{ productId: 'prod-1', cantidad: 3 }],
      notas: 'urgent delivery',
    });

    expect(capturedArgs).toEqual({
      p_store_id: 'store-1',
      p_items: [{ product_id: 'prod-1', cantidad: 3 }],
      p_notas: 'urgent delivery',
    });
    expect(orderId).toBe('new-order-uuid');
  });

  it('defaults p_notas to null when the caller omits notas', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_order: (args) => {
          capturedArgs = args;
          return { data: 'order-abc', error: null };
        },
      },
    });

    await createOrder(supabase, {
      storeId: 'store-1',
      items: [{ productId: 'prod-1', cantidad: 1 }],
    });

    expect(capturedArgs?.p_notas).toBeNull();
  });

  it('supports multiple items in a single order', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_order: (args) => {
          capturedArgs = args;
          return { data: 'order-multi', error: null };
        },
      },
    });

    await createOrder(supabase, {
      storeId: 'store-1',
      items: [
        { productId: 'prod-1', cantidad: 2 },
        { productId: 'prod-2', cantidad: 5 },
      ],
    });

    expect(capturedArgs?.p_items).toEqual([
      { product_id: 'prod-1', cantidad: 2 },
      { product_id: 'prod-2', cantidad: 5 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// cancelOrder
// ---------------------------------------------------------------------------
describe('cancelOrder', () => {
  it('calls cancel_order RPC with the correct order id', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        cancel_order: (args) => {
          capturedArgs = args;
          return { data: null, error: null };
        },
      },
    });

    await cancelOrder(supabase, 'order-1');

    expect(capturedArgs).toEqual({ p_order_id: 'order-1' });
  });

  it('resolves without throwing when the RPC succeeds', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        cancel_order: () => ({ data: null, error: null }),
      },
    });

    await expect(cancelOrder(supabase, 'order-1')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// nextInvoiceNumber
// ---------------------------------------------------------------------------
describe('nextInvoiceNumber', () => {
  it('calls next_invoice_number RPC with the tenant id and returns the counter', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        next_invoice_number: (args) => {
          capturedArgs = args;
          return { data: 42, error: null };
        },
      },
    });

    const num = await nextInvoiceNumber(supabase, 'tenant-1');

    expect(capturedArgs).toEqual({ p_tenant_id: 'tenant-1' });
    expect(num).toBe(42);
  });

  it('returns 1 for the first invoice of a tenant', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        next_invoice_number: () => ({ data: 1, error: null }),
      },
    });

    const num = await nextInvoiceNumber(supabase, 'tenant-new');
    expect(num).toBe(1);
  });
});
