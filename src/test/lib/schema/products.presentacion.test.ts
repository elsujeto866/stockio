/**
 * Unit tests for ProductInputSchema — presentacion field (PC-T3).
 *
 * Tests:
 *  - '70 g' passes through unchanged
 *  - '' (empty string) → null (emptyToNull/transform)
 *  - field omitted → accepted (optional, resolves to null/undefined)
 *  - string > 100 chars → rejected
 */

import { describe, it, expect } from 'vitest';
import { ProductInputSchema } from '@/lib/schema/products';

/** Minimal valid base — all required fields present. */
const base = {
  nombre: 'Galleta',
  precio_unitario: 1500,
  stock_actual: 10,
  stock_minimo: 2,
};

describe('ProductInputSchema — presentacion field', () => {
  it('passes "70 g" through unchanged', () => {
    const result = ProductInputSchema.safeParse({ ...base, presentacion: '70 g' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.presentacion).toBe('70 g');
    }
  });

  it('transforms empty string to null', () => {
    const result = ProductInputSchema.safeParse({ ...base, presentacion: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.presentacion).toBeNull();
    }
  });

  it('accepts omitted presentacion (optional field)', () => {
    const result = ProductInputSchema.safeParse({ ...base });
    expect(result.success).toBe(true);
  });

  it('rejects a string longer than 100 characters', () => {
    const tooLong = 'a'.repeat(101);
    const result = ProductInputSchema.safeParse({ ...base, presentacion: tooLong });
    expect(result.success).toBe(false);
  });
});
