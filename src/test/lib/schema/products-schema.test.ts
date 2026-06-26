/**
 * Unit tests for ProductInputSchema and StockAdjustSchema.
 * These are pure (no I/O) — safe to run in jsdom or node.
 */

import { describe, it, expect } from 'vitest';
import { ProductInputSchema, StockAdjustSchema } from '@/lib/schema/products';

// ---------------------------------------------------------------------------
// ProductInputSchema — valid input
// ---------------------------------------------------------------------------
describe('ProductInputSchema — valid input', () => {
  it('parses a fully populated valid product', () => {
    const result = ProductInputSchema.safeParse({
      nombre: 'Aceite de Oliva',
      sku: 'OL-001',
      categoria: 'Alimentos',
      precio_unitario: 10.5,
      stock_actual: 5,
      stock_minimo: 2,
      unidad_medida: 'litro',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nombre).toBe('Aceite de Oliva');
      expect(result.data.precio_unitario).toBe(10.5);
      expect(result.data.stock_actual).toBe(5);
      expect(result.data.stock_minimo).toBe(2);
    }
  });

  it('coerces string numbers to numbers (FormData simulation)', () => {
    const result = ProductInputSchema.safeParse({
      nombre: 'Widget',
      precio_unitario: '10.5',
      stock_actual: '5',
      stock_minimo: '2',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.precio_unitario).toBe('number');
      expect(result.data.precio_unitario).toBe(10.5);
      expect(typeof result.data.stock_actual).toBe('number');
      expect(result.data.stock_actual).toBe(5);
    }
  });

  it('accepts zero values for all numeric fields', () => {
    const result = ProductInputSchema.safeParse({
      nombre: 'Free Item',
      precio_unitario: 0,
      stock_actual: 0,
      stock_minimo: 0,
    });

    expect(result.success).toBe(true);
  });

  it('transforms null/undefined optional fields to null', () => {
    const result = ProductInputSchema.safeParse({
      nombre: 'Widget',
      precio_unitario: 5,
      stock_actual: 1,
      stock_minimo: 0,
      sku: null,
      categoria: undefined,
      unidad_medida: '',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBeNull();
      expect(result.data.categoria).toBeNull();
      expect(result.data.unidad_medida).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// ProductInputSchema — rejection
// ---------------------------------------------------------------------------
describe('ProductInputSchema — rejection', () => {
  it('rejects when nombre is absent', () => {
    const result = ProductInputSchema.safeParse({
      precio_unitario: 10,
      stock_actual: 5,
      stock_minimo: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.nombre).toBeDefined();
    }
  });

  it('rejects when nombre is empty string', () => {
    const result = ProductInputSchema.safeParse({
      nombre: '',
      precio_unitario: 10,
      stock_actual: 5,
      stock_minimo: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.nombre).toBeDefined();
    }
  });

  it('rejects negative precio_unitario', () => {
    const result = ProductInputSchema.safeParse({
      nombre: 'Widget',
      precio_unitario: -1,
      stock_actual: 5,
      stock_minimo: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.precio_unitario).toBeDefined();
    }
  });

  it('rejects negative precio_unitario from FormData string "-1"', () => {
    const result = ProductInputSchema.safeParse({
      nombre: 'Widget',
      precio_unitario: '-1',
      stock_actual: '5',
      stock_minimo: '2',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.precio_unitario).toBeDefined();
    }
  });

  it('rejects negative stock_actual', () => {
    const result = ProductInputSchema.safeParse({
      nombre: 'Widget',
      precio_unitario: 10,
      stock_actual: -1,
      stock_minimo: 2,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.stock_actual).toBeDefined();
    }
  });

  it('rejects negative stock_minimo', () => {
    const result = ProductInputSchema.safeParse({
      nombre: 'Widget',
      precio_unitario: 10,
      stock_actual: 5,
      stock_minimo: -1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.stock_minimo).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// StockAdjustSchema
// ---------------------------------------------------------------------------
describe('StockAdjustSchema', () => {
  it('parses a positive integer delta', () => {
    const result = StockAdjustSchema.safeParse({ delta: 5 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.delta).toBe(5);
  });

  it('parses a negative integer delta', () => {
    const result = StockAdjustSchema.safeParse({ delta: -3 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.delta).toBe(-3);
  });

  it('parses zero delta', () => {
    const result = StockAdjustSchema.safeParse({ delta: 0 });
    expect(result.success).toBe(true);
  });

  it('coerces string delta to integer', () => {
    const result = StockAdjustSchema.safeParse({ delta: '7' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.delta).toBe(7);
  });

  it('rejects a non-integer float delta', () => {
    const result = StockAdjustSchema.safeParse({ delta: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing delta', () => {
    const result = StockAdjustSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
