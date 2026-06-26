/**
 * ProductList — RSC presentational component.
 *
 * Maps an array of active products to ProductCard components.
 * Covered by E2E tests (e2e/inventory.spec.ts); no isolated unit test.
 */

import type { Product } from '@/lib/data/products';
import { ProductCard } from './ProductCard';
import Link from 'next/link';

interface Props {
  products: Product[];
}

export function ProductList({ products }: Props) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-3">
        <p className="text-gray-500 text-sm">No products yet.</p>
        <Link
          href="/products/new"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors min-h-[44px]"
        >
          Add your first product
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Product list">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
