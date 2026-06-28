/**
 * Unit tests for PurchaseItemInputSchema — expiryDate field addition.
 *
 * Tests: expiryDate optional, empty string → null
 * Covers: REQ-7 (purchase line expiry date validation)
 *
 * Pure — no I/O, no DB connection.
 */

import { describe, it, expect } from 'vitest';
import { PurchaseItemInputSchema } from '@/lib/schema/purchases';

// ---------------------------------------------------------------------------
// Minimal valid item
// ---------------------------------------------------------------------------
const validItem = {
  productId: '123e4567-e89b-12d3-a456-426614174000',
  cantidad: 5,
  costoUnitario: 10,
};

// ---------------------------------------------------------------------------
// PurchaseItemInputSchema — expiryDate
// ---------------------------------------------------------------------------
describe('PurchaseItemInputSchema — expiryDate', () => {
  it('accepts a valid item without expiryDate (backward compatible)', () => {
    const result = PurchaseItemInputSchema.safeParse(validItem);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiryDate).toBeUndefined();
  });

  it('accepts a valid ISO date string as expiryDate', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, expiryDate: '2026-04-01' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiryDate).toBe('2026-04-01');
  });

  it('transforms empty string expiryDate to null', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, expiryDate: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiryDate).toBeNull();
  });

  it('accepts null expiryDate explicitly', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, expiryDate: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiryDate).toBeNull();
  });

  it('accepts undefined expiryDate (omitted field)', () => {
    const result = PurchaseItemInputSchema.safeParse({ ...validItem, expiryDate: undefined });
    expect(result.success).toBe(true);
  });
});
