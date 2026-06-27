/**
 * Unit tests for OrderItemInputSchema and CreateOrderSchema.
 * Pure — no I/O, no DB connection required.
 */

import { describe, it, expect } from 'vitest';
import { OrderItemInputSchema, CreateOrderSchema } from '@/lib/schema/orders';

// ---------------------------------------------------------------------------
// OrderItemInputSchema
// ---------------------------------------------------------------------------
describe('OrderItemInputSchema', () => {
  it('accepts a valid productId UUID and cantidad ≥ 1', () => {
    const result = OrderItemInputSchema.safeParse({
      productId: '123e4567-e89b-12d3-a456-426614174000',
      cantidad: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.data.cantidad).toBe(3);
    }
  });

  it('coerces cantidad from string (FormData simulation)', () => {
    const result = OrderItemInputSchema.safeParse({
      productId: '123e4567-e89b-12d3-a456-426614174000',
      cantidad: '5',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.cantidad).toBe('number');
      expect(result.data.cantidad).toBe(5);
    }
  });

  it('rejects cantidad = 0', () => {
    const result = OrderItemInputSchema.safeParse({
      productId: '123e4567-e89b-12d3-a456-426614174000',
      cantidad: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.cantidad).toBeDefined();
    }
  });

  it('rejects a non-UUID productId', () => {
    const result = OrderItemInputSchema.safeParse({
      productId: 'not-a-uuid',
      cantidad: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.productId).toBeDefined();
    }
  });

  it('rejects a negative cantidad', () => {
    const result = OrderItemInputSchema.safeParse({
      productId: '123e4567-e89b-12d3-a456-426614174000',
      cantidad: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.cantidad).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// CreateOrderSchema — valid
// ---------------------------------------------------------------------------
describe('CreateOrderSchema — valid input', () => {
  // Zod v4 requires RFC-compliant UUIDs: version nibble [1-8], variant nibble [89abAB]
  const validStoreId = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
  const validProductId = '123e4567-e89b-12d3-a456-426614174000';

  it('parses a fully populated valid order', () => {
    const result = CreateOrderSchema.safeParse({
      storeId: validStoreId,
      items: [{ productId: validProductId, cantidad: 2 }],
      notas: 'Rush order',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.storeId).toBe(validStoreId);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.notas).toBe('Rush order');
    }
  });

  it('accepts multiple items', () => {
    const result = CreateOrderSchema.safeParse({
      storeId: validStoreId,
      items: [
        { productId: validProductId, cantidad: 1 },
        // Second UUID uses version nibble 4 and variant nibble 8 (RFC-compliant for Zod v4)
        { productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', cantidad: 3 },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
    }
  });

  it('transforms empty string notas to null', () => {
    const result = CreateOrderSchema.safeParse({
      storeId: validStoreId,
      items: [{ productId: validProductId, cantidad: 1 }],
      notas: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notas).toBeNull();
    }
  });

  it('transforms undefined notas to null', () => {
    const result = CreateOrderSchema.safeParse({
      storeId: validStoreId,
      items: [{ productId: validProductId, cantidad: 1 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notas).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// S2-T5: OrderItemInputSchema — saleUnit enum (REQ-2, Scenarios 2.1/2.2)
// RED until saleUnit is added to OrderItemInputSchema.
// ---------------------------------------------------------------------------
describe('OrderItemInputSchema — saleUnit (S2-T5)', () => {
  const validProductId = '123e4567-e89b-12d3-a456-426614174000';

  it('saleUnit defaults to "unit" when omitted', () => {
    const result = OrderItemInputSchema.safeParse({ productId: validProductId, cantidad: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.saleUnit).toBe('unit');
    }
  });

  it('accepts saleUnit = "unit" explicitly', () => {
    const result = OrderItemInputSchema.safeParse({
      productId: validProductId,
      cantidad: 1,
      saleUnit: 'unit',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.saleUnit).toBe('unit');
    }
  });

  it('accepts saleUnit = "package"', () => {
    const result = OrderItemInputSchema.safeParse({
      productId: validProductId,
      cantidad: 2,
      saleUnit: 'package',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.saleUnit).toBe('package');
    }
  });

  it('rejects an invalid saleUnit value', () => {
    const result = OrderItemInputSchema.safeParse({
      productId: validProductId,
      cantidad: 1,
      saleUnit: 'bulk',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.saleUnit).toBeDefined();
    }
  });

  it('CreateOrderSchema propagates saleUnit through items array', () => {
    const validStoreId = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
    const result = CreateOrderSchema.safeParse({
      storeId: validStoreId,
      items: [
        { productId: validProductId, cantidad: 2, saleUnit: 'package' },
        { productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', cantidad: 5 }, // defaults to 'unit'
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].saleUnit).toBe('package');
      expect(result.data.items[1].saleUnit).toBe('unit');
    }
  });
});

// ---------------------------------------------------------------------------
// CreateOrderSchema — rejection
// ---------------------------------------------------------------------------
describe('CreateOrderSchema — rejection', () => {
  const validStoreId = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
  const validProductId = '123e4567-e89b-12d3-a456-426614174000';

  it('rejects empty items array', () => {
    const result = CreateOrderSchema.safeParse({
      storeId: validStoreId,
      items: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.items).toBeDefined();
    }
  });

  it('rejects when storeId is not a valid UUID', () => {
    const result = CreateOrderSchema.safeParse({
      storeId: 'not-a-uuid',
      items: [{ productId: validProductId, cantidad: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.storeId).toBeDefined();
    }
  });

  it('rejects when storeId is absent', () => {
    const result = CreateOrderSchema.safeParse({
      items: [{ productId: validProductId, cantidad: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.storeId).toBeDefined();
    }
  });

  it('rejects when an item has cantidad = 0', () => {
    const result = CreateOrderSchema.safeParse({
      storeId: validStoreId,
      items: [{ productId: validProductId, cantidad: 0 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod v4 bubbles nested array-item errors up to fieldErrors.items
      expect(result.error.flatten().fieldErrors.items).toBeDefined();
    }
  });

  it('rejects when an item has a non-UUID productId', () => {
    const result = CreateOrderSchema.safeParse({
      storeId: validStoreId,
      items: [{ productId: 'bad-id', cantidad: 1 }],
    });
    expect(result.success).toBe(false);
  });
});
