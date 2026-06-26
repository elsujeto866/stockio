/**
 * LowStockWidget — RSC presentational component.
 *
 * Displays low-stock products (stock_actual < stock_minimo) with a count badge
 * and links to the products page. Mobile-first layout.
 */

import Link from 'next/link';
import type { Product } from '@/lib/data/products';

interface Props {
  products: Product[];
}

export function LowStockWidget({ products }: Props) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Stock bajo</h2>
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700 text-sm font-bold">
          {products.length}
        </span>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-gray-500">Todos los productos tienen stock suficiente</p>
      ) : (
        <ul className="space-y-2">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                href="/products"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900 truncate">{product.nombre}</span>
                <span className="ml-2 text-xs text-red-600 whitespace-nowrap">
                  {product.stock_actual} / {product.stock_minimo}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
