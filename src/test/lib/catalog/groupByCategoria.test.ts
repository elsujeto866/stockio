/**
 * Unit tests for groupByCategoria pure helper (PC-T4).
 *
 * Covers:
 *  - empty input → []
 *  - named categories keep SQL-given insertion order (no reordering of named buckets)
 *  - NULL categoria → 'Sin categoría' bucket placed LAST, even when NULL products appear first
 *  - products with same categoria grouped into one bucket
 */

import { describe, it, expect } from 'vitest';
import { groupByCategoria, SIN_CATEGORIA } from '@/lib/catalog/groupByCategoria';
import type { Product } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Fixture factory — only the fields groupByCategoria uses (categoria + id/nombre for identity)
// ---------------------------------------------------------------------------
function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: 'p-default',
    tenant_id: 't1',
    nombre: 'Producto',
    sku: null,
    categoria: null,
    precio_unitario: 100,
    stock_actual: 10,
    stock_minimo: 2,
    unidad_medida: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    units_per_package: null,
    precio_paca: null,
    cost_price: null,
    shelf_life_days: null,
    expiry_alert_days: 30,
    image_path: null,
    presentacion: null,
    ...overrides,
  };
}

describe('groupByCategoria', () => {
  it('returns [] for empty input', () => {
    expect(groupByCategoria([])).toEqual([]);
  });

  it('groups products by categoria into a single bucket', () => {
    const p1 = makeProduct({ id: 'p1', nombre: 'Galleta A', categoria: 'Galletas' });
    const p2 = makeProduct({ id: 'p2', nombre: 'Galleta B', categoria: 'Galletas' });
    const result = groupByCategoria([p1, p2]);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('Galletas');
    expect(result[0][1]).toHaveLength(2);
  });

  it('places the NULL categoria bucket LAST, even when NULL products appear first in input', () => {
    const nullFirst = makeProduct({ id: 'p-null', nombre: 'Sin cat', categoria: null });
    const named = makeProduct({ id: 'p-named', nombre: 'Bebida', categoria: 'Bebidas' });
    // NULL product appears FIRST in the input array (as if SQL returned it early)
    const result = groupByCategoria([nullFirst, named]);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('Bebidas');
    expect(result[1][0]).toBe(SIN_CATEGORIA);
  });

  it('preserves the SQL-given order of named categories (no re-sort of named buckets)', () => {
    // SQL returned: Bebidas, Galletas — the helper must not re-alphabetise them
    const b = makeProduct({ id: 'p-b', nombre: 'Producto B', categoria: 'Bebidas' });
    const g = makeProduct({ id: 'p-g', nombre: 'Producto G', categoria: 'Galletas' });
    const result = groupByCategoria([b, g]);
    expect(result[0][0]).toBe('Bebidas');
    expect(result[1][0]).toBe('Galletas');
  });

  it('groups multiple categories each with their own products', () => {
    const b1 = makeProduct({ id: 'b1', nombre: 'Agua', categoria: 'Bebidas' });
    const g1 = makeProduct({ id: 'g1', nombre: 'Galleta', categoria: 'Galletas' });
    const b2 = makeProduct({ id: 'b2', nombre: 'Jugo', categoria: 'Bebidas' });
    const result = groupByCategoria([b1, g1, b2]);
    expect(result).toHaveLength(2);
    const bebidasBucket = result.find(([cat]) => cat === 'Bebidas');
    expect(bebidasBucket?.[1]).toHaveLength(2);
    const galletasBucket = result.find(([cat]) => cat === 'Galletas');
    expect(galletasBucket?.[1]).toHaveLength(1);
  });

  it('uses "Sin categoría" as the bucket label for NULL categoria', () => {
    const p = makeProduct({ id: 'p1', nombre: 'Sin categoria', categoria: null });
    const result = groupByCategoria([p]);
    expect(result[0][0]).toBe('Sin categoría');
  });
});
