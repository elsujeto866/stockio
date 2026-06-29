import type { Product } from '@/lib/data/products';

export const SIN_CATEGORIA = 'Sin categoría';

/**
 * Groups pre-sorted products by categoria.
 *
 * Relies on the caller having sorted products via SQL:
 *   ORDER BY categoria NULLS LAST, nombre
 *
 * Returns ordered [categoria, products][] with the NULL bucket
 * ('Sin categoría') ALWAYS last, regardless of insertion order.
 *
 * Named-category order is preserved as given by SQL — no re-sort applied.
 */
export function groupByCategoria(products: Product[]): Array<[string, Product[]]> {
  const groups = new Map<string, Product[]>();

  for (const p of products) {
    const key = p.categoria ?? SIN_CATEGORIA;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(p);
    } else {
      groups.set(key, [p]);
    }
  }

  // SQL already ordered named categories; force the NULL bucket last
  // regardless of its insertion order.
  const entries = [...groups.entries()];
  return entries.sort(([a], [b]) =>
    a === SIN_CATEGORIA ? 1 : b === SIN_CATEGORIA ? -1 : 0
  );
}
