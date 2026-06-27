/**
 * Unit tests for dashboard domain helpers.
 * Pure functions — no I/O, no side effects.
 */

import { describe, it, expect } from 'vitest';
import {
  filterLowStock,
  countLowStock,
  sumOrderTotals,
  countNonCancelledOrders,
} from '@/lib/domain/dashboard';
import type { Product } from '@/lib/data/products';
import type { OrderListItem } from '@/lib/data/orders';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    tenant_id: 'tenant-1',
    nombre: 'Widget',
    sku: null,
    categoria: null,
    precio_unitario: 10,
    stock_actual: 10,
    stock_minimo: 5,
    unidad_medida: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    units_per_package: null,
    precio_paca: null,
    cost_price: null,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: 'order-1',
    tenant_id: 'tenant-1',
    store_id: 'store-1',
    fecha: '2026-06-01',
    estado: 'pendiente',
    total: 100,
    notas: null,
    created_at: '2026-06-01T00:00:00Z',
    store: { nombre: 'Store A' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// filterLowStock
// ---------------------------------------------------------------------------
describe('filterLowStock', () => {
  it('returns products where stock_actual is strictly below stock_minimo', () => {
    const low = makeProduct({ stock_actual: 4, stock_minimo: 5 });
    const ok = makeProduct({ id: 'p2', stock_actual: 5, stock_minimo: 5 });
    const result = filterLowStock([low, ok]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('prod-1');
  });

  it('excludes products where stock_actual equals stock_minimo (boundary — NOT low stock)', () => {
    const equal = makeProduct({ stock_actual: 5, stock_minimo: 5 });
    expect(filterLowStock([equal])).toHaveLength(0);
  });

  it('excludes products where stock_actual is above stock_minimo', () => {
    const above = makeProduct({ stock_actual: 10, stock_minimo: 5 });
    expect(filterLowStock([above])).toHaveLength(0);
  });

  it('returns empty array when given an empty list', () => {
    expect(filterLowStock([])).toHaveLength(0);
  });

  it('returns all products when all are below minimum', () => {
    const p1 = makeProduct({ id: 'p1', stock_actual: 1, stock_minimo: 10 });
    const p2 = makeProduct({ id: 'p2', stock_actual: 0, stock_minimo: 5 });
    expect(filterLowStock([p1, p2])).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// countLowStock
// ---------------------------------------------------------------------------
describe('countLowStock', () => {
  it('returns the count of products below minimum', () => {
    const p1 = makeProduct({ id: 'p1', stock_actual: 1, stock_minimo: 10 });
    const p2 = makeProduct({ id: 'p2', stock_actual: 10, stock_minimo: 10 });
    expect(countLowStock([p1, p2])).toBe(1);
  });

  it('returns 0 when no products are low stock', () => {
    const p = makeProduct({ stock_actual: 20, stock_minimo: 5 });
    expect(countLowStock([p])).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(countLowStock([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sumOrderTotals
// ---------------------------------------------------------------------------
describe('sumOrderTotals', () => {
  it('sums totals of non-cancelado orders', () => {
    const orders = [
      makeOrder({ id: 'o1', estado: 'pendiente', total: 50 }),
      makeOrder({ id: 'o2', estado: 'entregado', total: 75 }),
    ];
    expect(sumOrderTotals(orders)).toBe(125);
  });

  it('excludes cancelado orders from the sum', () => {
    const orders = [
      makeOrder({ id: 'o1', estado: 'pendiente', total: 100 }),
      makeOrder({ id: 'o2', estado: 'cancelado', total: 200 }),
    ];
    expect(sumOrderTotals(orders)).toBe(100);
  });

  it('treats null total as 0 (null-total guard)', () => {
    const orders = [
      makeOrder({ id: 'o1', estado: 'pendiente', total: null }),
      makeOrder({ id: 'o2', estado: 'entregado', total: 50 }),
    ];
    expect(sumOrderTotals(orders)).toBe(50);
  });

  it('returns 0 when all orders are cancelado', () => {
    const orders = [
      makeOrder({ id: 'o1', estado: 'cancelado', total: 100 }),
      makeOrder({ id: 'o2', estado: 'cancelado', total: 200 }),
    ];
    expect(sumOrderTotals(orders)).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(sumOrderTotals([])).toBe(0);
  });

  it('handles mixed: null total + cancelado + valid orders', () => {
    const orders = [
      makeOrder({ id: 'o1', estado: 'pendiente', total: null }),
      makeOrder({ id: 'o2', estado: 'cancelado', total: 999 }),
      makeOrder({ id: 'o3', estado: 'entregado', total: 75 }),
    ];
    expect(sumOrderTotals(orders)).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// countNonCancelledOrders
// ---------------------------------------------------------------------------
describe('countNonCancelledOrders', () => {
  it('counts only non-cancelado orders', () => {
    const orders = [
      makeOrder({ id: 'o1', estado: 'pendiente' }),
      makeOrder({ id: 'o2', estado: 'entregado' }),
      makeOrder({ id: 'o3', estado: 'cancelado' }),
    ];
    expect(countNonCancelledOrders(orders)).toBe(2);
  });

  it('returns 0 when all orders are cancelado', () => {
    const orders = [makeOrder({ estado: 'cancelado' })];
    expect(countNonCancelledOrders(orders)).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(countNonCancelledOrders([])).toBe(0);
  });
});
