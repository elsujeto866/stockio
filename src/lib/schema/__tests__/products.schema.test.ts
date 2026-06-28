/**
 * Unit tests for ProductInputSchema — expiry field additions.
 *
 * Tests: shelf_life_days (nullable positive int), expiry_alert_days (default 30, positive)
 * Covers: REQ-7, S7-1, S7-2
 *
 * Pure — no I/O, no DB connection.
 */

import { describe, it, expect } from 'vitest';
import { ProductInputSchema } from '@/lib/schema/products';

// ---------------------------------------------------------------------------
// Minimal valid base (all required fields; pack fields omitted = null)
// ---------------------------------------------------------------------------
const validBase = {
  nombre: 'Test Product',
  precio_unitario: 10,
  stock_actual: 5,
  stock_minimo: 1,
};

// ---------------------------------------------------------------------------
// shelf_life_days
// ---------------------------------------------------------------------------
describe('ProductInputSchema — shelf_life_days', () => {
  it('accepts a positive integer', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, shelf_life_days: 90 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shelf_life_days).toBe(90);
  });

  it('accepts null (field not required)', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, shelf_life_days: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shelf_life_days).toBeNull();
  });

  it('treats empty string as null (emptyToNull preprocessing)', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, shelf_life_days: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shelf_life_days).toBeNull();
  });

  it('is null when omitted (optional field)', () => {
    const result = ProductInputSchema.safeParse({ ...validBase });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shelf_life_days).toBeNull();
  });

  it('rejects -1 with a validation error (S7-1)', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, shelf_life_days: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.shelf_life_days).toBeDefined();
    }
  });

  it('rejects 0 (must be positive, not just non-negative)', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, shelf_life_days: 0 });
    expect(result.success).toBe(false);
  });

  it('coerces string "180" to number 180', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, shelf_life_days: '180' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shelf_life_days).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// expiry_alert_days
// ---------------------------------------------------------------------------
describe('ProductInputSchema — expiry_alert_days', () => {
  it('defaults to 30 when omitted (S7-2)', () => {
    const result = ProductInputSchema.safeParse({ ...validBase });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiry_alert_days).toBe(30);
  });

  it('accepts explicit value 7', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, expiry_alert_days: 7 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiry_alert_days).toBe(7);
  });

  it('rejects 0 (must be positive)', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, expiry_alert_days: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.expiry_alert_days).toBeDefined();
    }
  });

  it('rejects negative values', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, expiry_alert_days: -5 });
    expect(result.success).toBe(false);
  });

  it('coerces string "14" to number 14', () => {
    const result = ProductInputSchema.safeParse({ ...validBase, expiry_alert_days: '14' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiry_alert_days).toBe(14);
  });
});
