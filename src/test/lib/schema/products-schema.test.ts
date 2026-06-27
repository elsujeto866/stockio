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
// ProductInputSchema — pack fields (S1-T4)
// RED until S1-T5 adds units_per_package / precio_paca + emptyToNull + refine.
// ---------------------------------------------------------------------------
describe('ProductInputSchema — pack fields (S1-T4)', () => {
  const base = {
    nombre: 'Aceite',
    precio_unitario: 6.0,
    stock_actual: 100,
    stock_minimo: 5,
  };

  it('empty string for units_per_package is treated as null (emptyToNull preprocess)', () => {
    const result = ProductInputSchema.safeParse({
      ...base,
      units_per_package: '',
      precio_paca: '',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units_per_package).toBeNull();
      expect(result.data.precio_paca).toBeNull();
    }
  });

  it('undefined units_per_package is treated as null', () => {
    const result = ProductInputSchema.safeParse({
      ...base,
      units_per_package: undefined,
      precio_paca: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units_per_package).toBeNull();
    }
  });

  it('rejects units_per_package = 1 (min 2)', () => {
    const result = ProductInputSchema.safeParse({
      ...base,
      units_per_package: 1,
      precio_paca: 100,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.units_per_package).toBeDefined();
      expect(errors.units_per_package![0]).toMatch(/al menos 2/i);
    }
  });

  it('rejects precio_paca set without units_per_package (cross-field refine)', () => {
    const result = ProductInputSchema.safeParse({
      ...base,
      units_per_package: null,
      precio_paca: 150,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.precio_paca).toBeDefined();
    }
  });

  // RED until symmetric both-or-neither refine is added (S1-T5 update)
  it('rejects units_per_package set without precio_paca (symmetric both-or-neither refine)', () => {
    const result = ProductInputSchema.safeParse({
      ...base,
      units_per_package: 30,
      precio_paca: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.units_per_package).toBeDefined();
    }
  });

  it('accepts a valid packaged product (both fields present)', () => {
    const result = ProductInputSchema.safeParse({
      ...base,
      units_per_package: 30,
      precio_paca: 150.0,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units_per_package).toBe(30);
      expect(result.data.precio_paca).toBe(150.0);
    }
  });

  it('accepts unit-only product (both fields null)', () => {
    const result = ProductInputSchema.safeParse({
      ...base,
      units_per_package: null,
      precio_paca: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units_per_package).toBeNull();
      expect(result.data.precio_paca).toBeNull();
    }
  });

  it('accepts unit-only product when pack fields are absent entirely', () => {
    const result = ProductInputSchema.safeParse({ ...base });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units_per_package).toBeNull();
      expect(result.data.precio_paca).toBeNull();
    }
  });

  it('coerces string "30" for units_per_package to integer 30', () => {
    const result = ProductInputSchema.safeParse({
      ...base,
      units_per_package: '30',
      precio_paca: '150.00',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units_per_package).toBe(30);
      expect(result.data.precio_paca).toBe(150.0);
    }
  });
});

// ---------------------------------------------------------------------------
// ProductInputSchema — cost_price field (S3-T5)
// ---------------------------------------------------------------------------
describe('ProductInputSchema — cost_price field (S3-T5)', () => {
  const base = {
    nombre: 'Aceite',
    precio_unitario: 10.0,
    stock_actual: 50,
    stock_minimo: 5,
  };

  it('empty string for cost_price is treated as null (emptyToNull preprocess)', () => {
    const result = ProductInputSchema.safeParse({ ...base, cost_price: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cost_price).toBeNull();
    }
  });

  it('absent cost_price is treated as null', () => {
    const result = ProductInputSchema.safeParse({ ...base });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cost_price).toBeNull();
    }
  });

  it('coerces valid string "5.50" to number 5.5', () => {
    const result = ProductInputSchema.safeParse({ ...base, cost_price: '5.50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cost_price).toBe(5.5);
    }
  });

  it('accepts zero cost_price', () => {
    const result = ProductInputSchema.safeParse({ ...base, cost_price: '0' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cost_price).toBe(0);
    }
  });

  it('rejects negative cost_price with field error', () => {
    const result = ProductInputSchema.safeParse({ ...base, cost_price: '-1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.cost_price).toBeDefined();
      expect(errors.cost_price![0]).toMatch(/mayor o igual a 0/);
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
