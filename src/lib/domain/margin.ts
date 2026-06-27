import type { Product } from '@/lib/data/products';

/** Computed margin. `null` fields mean "unknown / not computable" → render "—". */
export interface Margin {
  amount: number | null;   // currency, rounded to 2 decimals
  percent: number | null;  // percentage, rounded to 1 decimal
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Unit margin = precio_unitario - cost_price.
 * NULL cost → both fields null. Divide-by-zero guard: sale price 0 → percent null
 * (amount still returned).
 */
export function computeUnitMargin(
  p: Pick<Product, 'precio_unitario' | 'cost_price'>
): Margin {
  if (p.cost_price == null) return { amount: null, percent: null };
  const amount = round2(p.precio_unitario - p.cost_price);
  const percent =
    p.precio_unitario > 0
      ? round1(((p.precio_unitario - p.cost_price) / p.precio_unitario) * 100)
      : null;
  return { amount, percent };
}

/**
 * Pack margin = precio_paca - cost_price * units_per_package.
 * Requires cost_price AND units_per_package AND precio_paca all present; any null →
 * both fields null. Divide-by-zero guard: precio_paca 0 → percent null.
 */
export function computePackMargin(
  p: Pick<Product, 'precio_paca' | 'cost_price' | 'units_per_package'>
): Margin {
  if (p.cost_price == null || p.units_per_package == null || p.precio_paca == null) {
    return { amount: null, percent: null };
  }
  const packCost = p.cost_price * p.units_per_package;
  const amount = round2(p.precio_paca - packCost);
  const percent =
    p.precio_paca > 0
      ? round1(((p.precio_paca - packCost) / p.precio_paca) * 100)
      : null;
  return { amount, percent };
}
