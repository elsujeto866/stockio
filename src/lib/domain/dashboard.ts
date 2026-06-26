/**
 * Dashboard domain helpers.
 *
 * Pure functions — no I/O, no side effects.
 * Importable in both RSC and client components without bundling Supabase.
 */

import type { Product } from '@/lib/data/products';
import type { OrderListItem } from '@/lib/data/orders';

/**
 * Returns only products where stock_actual is strictly less than stock_minimo.
 * Products where stock_actual === stock_minimo are NOT considered low stock.
 */
export const filterLowStock = (products: Product[]): Product[] =>
  products.filter((p) => p.stock_actual < p.stock_minimo);

/**
 * Returns the count of low-stock products.
 */
export const countLowStock = (products: Product[]): number =>
  filterLowStock(products).length;

/**
 * Sums the totals of all non-cancelado orders.
 * Guards against null totals by treating them as 0.
 */
export const sumOrderTotals = (orders: OrderListItem[]): number =>
  orders
    .filter((o) => o.estado !== 'cancelado')
    .reduce((acc, o) => acc + (o.total ?? 0), 0);

/**
 * Returns the count of orders that are not cancelado.
 */
export const countNonCancelledOrders = (orders: OrderListItem[]): number =>
  orders.filter((o) => o.estado !== 'cancelado').length;
