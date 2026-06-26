/**
 * Inventory domain helpers.
 *
 * Pure functions — no I/O, no side effects.
 * Importable in both RSC and client components without bundling Supabase.
 */

import type { Product } from '@/lib/data/products';

/**
 * Returns true when stock_actual is strictly less than stock_minimo.
 * Equal values (stock_actual === stock_minimo) is NOT considered low stock.
 *
 * R6: isLowStock MUST use strict < comparison.
 */
export const isLowStock = (
  p: Pick<Product, 'stock_actual' | 'stock_minimo'>
): boolean => p.stock_actual < p.stock_minimo;

/**
 * Formats the current stock with its unit of measure.
 * Falls back to 'u' (units) when unidad_medida is null.
 */
export const formatStock = (
  p: Pick<Product, 'stock_actual' | 'unidad_medida'>
): string => `${p.stock_actual} ${p.unidad_medida ?? 'u'}`;
