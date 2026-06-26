/**
 * Unit tests for inventory domain helpers.
 * Pure functions — no I/O, no side effects.
 */

import { describe, it, expect } from 'vitest';
import { isLowStock, formatStock } from '@/lib/domain/inventory';

// ---------------------------------------------------------------------------
// isLowStock — strict less-than boundary
// ---------------------------------------------------------------------------
describe('isLowStock', () => {
  it('returns true when stock_actual is strictly below stock_minimo', () => {
    expect(isLowStock({ stock_actual: 4, stock_minimo: 5 })).toBe(true);
  });

  it('returns false when stock_actual equals stock_minimo (equal is NOT low)', () => {
    expect(isLowStock({ stock_actual: 5, stock_minimo: 5 })).toBe(false);
  });

  it('returns false when stock_actual is above stock_minimo', () => {
    expect(isLowStock({ stock_actual: 6, stock_minimo: 5 })).toBe(false);
  });

  it('returns true when stock_actual is 0 and stock_minimo is 1', () => {
    expect(isLowStock({ stock_actual: 0, stock_minimo: 1 })).toBe(true);
  });

  it('returns false when both stock_actual and stock_minimo are 0', () => {
    expect(isLowStock({ stock_actual: 0, stock_minimo: 0 })).toBe(false);
  });

  it('returns true when stock_actual is 1 below minimum (boundary minus one)', () => {
    expect(isLowStock({ stock_actual: 9, stock_minimo: 10 })).toBe(true);
  });

  it('returns false when stock_actual is 1 above minimum (boundary plus one)', () => {
    expect(isLowStock({ stock_actual: 11, stock_minimo: 10 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatStock
// ---------------------------------------------------------------------------
describe('formatStock', () => {
  it('formats stock with its unit of measure', () => {
    expect(formatStock({ stock_actual: 10, unidad_medida: 'litro' })).toBe('10 litro');
  });

  it('falls back to "u" when unidad_medida is null', () => {
    expect(formatStock({ stock_actual: 5, unidad_medida: null })).toBe('5 u');
  });

  it('formats zero stock', () => {
    expect(formatStock({ stock_actual: 0, unidad_medida: 'kg' })).toBe('0 kg');
  });
});
