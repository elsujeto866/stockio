/**
 * Unit tests for PurchaseItemInputSchema and CreatePurchaseSchema.
 *
 * Key invariants:
 *  - costoUnitario: >= 0 (zero-cost lines valid); coerces from string
 *  - cantidad: integer >= 1; coerces from string
 *  - items: must have >= 1 element
 *  - supplierId: must be a valid UUID
 *  - fecha: optional; omitted → undefined
 *  - notas: optional nullable → null when absent
 *
 * Satisfies: REQ-Z1 (all purchase validations)
 */

import { describe, it, expect } from 'vitest';
import { PurchaseItemInputSchema, CreatePurchaseSchema } from '@/lib/schema/purchases';

const SUPPLIER_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
const PRODUCT_UUID  = 'aaaabbbb-cccc-4ddd-8eee-ffff00002222';

const validItem = {
  productId: PRODUCT_UUID,
  cantidad: 2,
  costoUnitario: 5.50,
};

// ---------------------------------------------------------------------------
// PurchaseItemInputSchema
// ---------------------------------------------------------------------------
describe('PurchaseItemInputSchema', () => {
  it('accepts a valid item', () => {
    const result = PurchaseItemInputSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid productId UUID', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, productId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.productId).toBeDefined();
    }
  });

  it('accepts cantidad = 1', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, cantidad: 1 });
    expect(result.success).toBe(true);
  });

  it('rejects cantidad = 0', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, cantidad: 0 });
    expect(result.success).toBe(false);
  });

  it('coerces string cantidad to integer', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, cantidad: '3' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cantidad).toBe(3);
    }
  });

  it('accepts costoUnitario = 0 (zero-cost lines valid per REQ-Z1)', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, costoUnitario: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects costoUnitario = -1', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, costoUnitario: -1 });
    expect(result.success).toBe(false);
  });

  it('coerces string costoUnitario to number', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, costoUnitario: '5.50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.costoUnitario).toBeCloseTo(5.50);
    }
  });
});

// ---------------------------------------------------------------------------
// CreatePurchaseSchema
// ---------------------------------------------------------------------------
describe('CreatePurchaseSchema', () => {
  it('accepts valid payload with one item', () => {
    const result = CreatePurchaseSchema.safeParse({
      supplierId: SUPPLIER_UUID,
      items: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it('rejects supplierId that is not a UUID', () => {
    const result = CreatePurchaseSchema.safeParse({
      supplierId: 'not-a-uuid',
      items: [validItem],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.supplierId).toBeDefined();
    }
  });

  it('rejects items = [] (min 1 required)', () => {
    const result = CreatePurchaseSchema.safeParse({
      supplierId: SUPPLIER_UUID,
      items: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.items).toBeDefined();
    }
  });

  it('accepts 2+ valid items', () => {
    const result = CreatePurchaseSchema.safeParse({
      supplierId: SUPPLIER_UUID,
      items: [
        validItem,
        { productId: PRODUCT_UUID, cantidad: 1, costoUnitario: 100 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('fecha omitted → undefined in output', () => {
    const result = CreatePurchaseSchema.safeParse({
      supplierId: SUPPLIER_UUID,
      items: [validItem],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fecha).toBeUndefined();
    }
  });

  it('fecha provided as valid date string → preserved', () => {
    const result = CreatePurchaseSchema.safeParse({
      supplierId: SUPPLIER_UUID,
      items: [validItem],
      fecha: '2025-01-15',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fecha).toBe('2025-01-15');
    }
  });

  it('notas = null → passes', () => {
    const result = CreatePurchaseSchema.safeParse({
      supplierId: SUPPLIER_UUID,
      items: [validItem],
      notas: null,
    });
    expect(result.success).toBe(true);
  });

  it('notas omitted → null in output', () => {
    const result = CreatePurchaseSchema.safeParse({
      supplierId: SUPPLIER_UUID,
      items: [validItem],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notas).toBeNull();
    }
  });
});
