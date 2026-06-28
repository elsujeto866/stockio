/**
 * Unit tests for createPurchase — expiryDate mapping to p_items jsonb.
 *
 * Tests: createPurchase serializes expiryDate as expiry_date in p_items jsonb
 * when provided; omits key when undefined; uses mock supabase client.
 *
 * Covers: REQ-1 (purchase lot creation — data layer mapping)
 */

import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { createPurchase } from '@/lib/data/purchases';

const PURCHASE_ID = 'purchase-uuid-1234';

// ---------------------------------------------------------------------------
// createPurchase — expiryDate serialization
// ---------------------------------------------------------------------------
describe('createPurchase — expiryDate mapping', () => {
  it('includes expiry_date in p_items element when expiryDate is provided', async () => {
    let capturedArgs: Record<string, unknown> | null = null;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: (args) => {
          capturedArgs = args;
          return { data: PURCHASE_ID, error: null };
        },
      },
    });

    await createPurchase(supabase, {
      supplierId: 'supplier-1',
      items: [
        {
          productId: 'product-1',
          cantidad: 10,
          costoUnitario: 5.0,
          expiryDate: '2026-04-01',
        },
      ],
    });

    expect(capturedArgs).not.toBeNull();
    const items = capturedArgs!.p_items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].expiry_date).toBe('2026-04-01');
  });

  it('includes expiry_date as null in p_items when expiryDate is null', async () => {
    let capturedArgs: Record<string, unknown> | null = null;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: (args) => {
          capturedArgs = args;
          return { data: PURCHASE_ID, error: null };
        },
      },
    });

    await createPurchase(supabase, {
      supplierId: 'supplier-1',
      items: [
        {
          productId: 'product-1',
          cantidad: 10,
          costoUnitario: 5.0,
          expiryDate: null,
        },
      ],
    });

    expect(capturedArgs).not.toBeNull();
    const items = capturedArgs!.p_items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].expiry_date).toBeNull();
  });

  it('omits expiry_date key in p_items when expiryDate is undefined', async () => {
    let capturedArgs: Record<string, unknown> | null = null;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: (args) => {
          capturedArgs = args;
          return { data: PURCHASE_ID, error: null };
        },
      },
    });

    await createPurchase(supabase, {
      supplierId: 'supplier-1',
      items: [
        {
          productId: 'product-1',
          cantidad: 10,
          costoUnitario: 5.0,
          // expiryDate omitted
        },
      ],
    });

    expect(capturedArgs).not.toBeNull();
    const items = capturedArgs!.p_items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect('expiry_date' in items[0]).toBe(false);
  });

  it('handles multiple items, each with their own expiryDate', async () => {
    let capturedArgs: Record<string, unknown> | null = null;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: (args) => {
          capturedArgs = args;
          return { data: PURCHASE_ID, error: null };
        },
      },
    });

    await createPurchase(supabase, {
      supplierId: 'supplier-1',
      items: [
        { productId: 'product-1', cantidad: 10, costoUnitario: 5.0, expiryDate: '2026-04-01' },
        { productId: 'product-2', cantidad: 5, costoUnitario: 3.0, expiryDate: null },
        { productId: 'product-3', cantidad: 20, costoUnitario: 1.5 },
      ],
    });

    const items = capturedArgs!.p_items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0].expiry_date).toBe('2026-04-01');
    expect(items[1].expiry_date).toBeNull();
    expect('expiry_date' in items[2]).toBe(false);
  });

  it('returns the purchase UUID from the RPC', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        create_purchase: () => ({ data: PURCHASE_ID, error: null }),
      },
    });

    const result = await createPurchase(supabase, {
      supplierId: 'supplier-1',
      items: [{ productId: 'product-1', cantidad: 1, costoUnitario: 1 }],
    });

    expect(result).toBe(PURCHASE_ID);
  });
});
