/**
 * LowStockBadge — RSC presentational component.
 *
 * Renders a red "Low stock" badge when stock_actual < stock_minimo.
 * Renders nothing when stock is at or above the minimum (R6).
 *
 * Uses the pure isLowStock domain helper — no I/O.
 */

import { isLowStock } from '@/lib/domain/inventory';
import type { Product } from '@/lib/data/products';

interface Props {
  product: Pick<Product, 'stock_actual' | 'stock_minimo'>;
}

export function LowStockBadge({ product }: Props) {
  if (!isLowStock(product)) return null;

  return (
    <span
      role="status"
      className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 border border-red-200"
    >
      Stock bajo
    </span>
  );
}
