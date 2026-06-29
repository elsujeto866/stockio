/**
 * Unit tests for ProductInputSchema — image_path field.
 *
 * PP-T4: REQ-1 (S1-1..S1-4), REQ-6 (nullable).
 * Pure — no I/O, no DB connection.
 */

import { describe, it, expect } from 'vitest';
import { ProductInputSchema } from '@/lib/schema/products';

const validBase = {
  nombre: 'Test Product',
  precio_unitario: 10,
  stock_actual: 5,
  stock_minimo: 1,
};

describe('ProductInputSchema — image_path field', () => {
  it('accepts a valid path string', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, image_path: 'tenant/id.jpg' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.image_path).toBe('tenant/id.jpg');
  });

  it('accepts null explicitly', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, image_path: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.image_path).toBeNull();
  });

  it('transforms empty string to null', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, image_path: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.image_path).toBeNull();
  });

  it('is null when omitted (optional field)', () => {
    const result = ProductInputSchema.safeParse({ ...validBase });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.image_path).toBeNull();
  });

  it('rejects a string longer than 512 chars', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, image_path: 'x'.repeat(513) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.image_path).toBeDefined();
    }
  });

  it('accepts exactly 512 chars', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, image_path: 'x'.repeat(512) });
    expect(result.success).toBe(true);
  });
});
