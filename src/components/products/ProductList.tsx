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
  /** Signed URL map for product photos (path → url). Built once by the RSC page. */
  photoUrls?: Map<string, string>;
}

export function ProductList({ products, photoUrls }: Props) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-3">
        <p className="text-3xl">📦</p>
        <p className="text-gray-500 text-sm">No hay productos todavía</p>
        <Link
          href="/products/new"
          className="btn-primary"
        >
          Agrega tu primer producto
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Lista de productos">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            imageUrl={
              product.image_path
                ? (photoUrls?.get(product.image_path) ?? null)
                : null
            }
          />
        </li>
      ))}
    </ul>
  );
}
