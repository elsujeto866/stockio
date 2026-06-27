/**
 * Unit tests for margin domain helpers.
 *
 * Pure functions — no I/O, no side effects.
 * Covers all 12 spec scenarios (S3-T2).
 */

import { describe, it, expect } from 'vitest';
import { computeUnitMargin, computePackMargin } from '@/lib/domain/margin';

// ---------------------------------------------------------------------------
// computeUnitMargin
// ---------------------------------------------------------------------------
describe('computeUnitMargin', () => {
  it('returns {null, null} when cost_price is null (NULL cost hides margin)', () => {
    const result = computeUnitMargin({ precio_unitario: 10, cost_price: null });
    expect(result).toEqual({ amount: null, percent: null });
  });

  it('returns {null, null} when cost_price is undefined (treated as null)', () => {
    // undefined behaves like null via == null guard
    const result = computeUnitMargin({ precio_unitario: 10, cost_price: undefined as never });
    expect(result).toEqual({ amount: null, percent: null });
  });

  it('computes positive unit margin (price 10, cost 6 → {4.00, 40.0})', () => {
    const result = computeUnitMargin({ precio_unitario: 10, cost_price: 6 });
    expect(result).toEqual({ amount: 4, percent: 40 });
  });

  it('computes 100% margin when cost is zero (price 10, cost 0 → {10.00, 100.0})', () => {
    const result = computeUnitMargin({ precio_unitario: 10, cost_price: 0 });
    expect(result).toEqual({ amount: 10, percent: 100 });
  });

  it('computes zero margin when cost equals price (price 10, cost 10 → {0.00, 0.0})', () => {
    const result = computeUnitMargin({ precio_unitario: 10, cost_price: 10 });
    expect(result).toEqual({ amount: 0, percent: 0 });
  });

  it('computes negative margin when cost exceeds price (price 8, cost 10 → {-2.00, -25.0})', () => {
    const result = computeUnitMargin({ precio_unitario: 8, cost_price: 10 });
    expect(result).toEqual({ amount: -2, percent: -25 });
  });

  it('returns percent null when price is zero (divide-by-zero guard), amount is returned', () => {
    const result = computeUnitMargin({ precio_unitario: 0, cost_price: 5 });
    expect(result.percent).toBeNull();
    expect(result.amount).toBe(-5);
  });

  it('rounds amount to 2 decimal places', () => {
    // price 10, cost 3.333 → amount = 6.667 → rounded to 6.67
    const result = computeUnitMargin({ precio_unitario: 10, cost_price: 3.333 });
    expect(result.amount).toBe(6.67);
  });

  it('rounds percent to 1 decimal place', () => {
    // price 3, cost 2 → percent = (1/3)*100 = 33.333... → 33.3%
    const result = computeUnitMargin({ precio_unitario: 3, cost_price: 2 });
    expect(result.percent).toBe(33.3);
  });
});

// ---------------------------------------------------------------------------
// computePackMargin
// ---------------------------------------------------------------------------
describe('computePackMargin', () => {
  it('computes positive pack margin (cost 5, upp 10, precio_paca 60 → {10.00, 16.7})', () => {
    const result = computePackMargin({
      cost_price: 5,
      units_per_package: 10,
      precio_paca: 60,
    });
    expect(result).toEqual({ amount: 10, percent: 16.7 });
  });

  it('computes negative pack margin (cost 7, upp 10, precio_paca 60 → {-10.00, -16.7})', () => {
    const result = computePackMargin({
      cost_price: 7,
      units_per_package: 10,
      precio_paca: 60,
    });
    expect(result).toEqual({ amount: -10, percent: -16.7 });
  });

  it('returns {null, null} when cost_price is null', () => {
    const result = computePackMargin({
      cost_price: null,
      units_per_package: 10,
      precio_paca: 60,
    });
    expect(result).toEqual({ amount: null, percent: null });
  });

  it('returns {null, null} when units_per_package is null (No packaging data)', () => {
    const result = computePackMargin({
      cost_price: 5,
      units_per_package: null,
      precio_paca: 60,
    });
    expect(result).toEqual({ amount: null, percent: null });
  });

  it('returns {null, null} when precio_paca is null (No packaging data)', () => {
    const result = computePackMargin({
      cost_price: 5,
      units_per_package: 10,
      precio_paca: null,
    });
    expect(result).toEqual({ amount: null, percent: null });
  });

  it('returns percent null when precio_paca is zero (divide-by-zero guard)', () => {
    const result = computePackMargin({
      cost_price: 5,
      units_per_package: 10,
      precio_paca: 0,
    });
    expect(result.percent).toBeNull();
    // amount = 0 - 5*10 = -50
    expect(result.amount).toBe(-50);
  });

  it('returns {null, null} when all three pack inputs are null', () => {
    const result = computePackMargin({
      cost_price: null,
      units_per_package: null,
      precio_paca: null,
    });
    expect(result).toEqual({ amount: null, percent: null });
  });
});
