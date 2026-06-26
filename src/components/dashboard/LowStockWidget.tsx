/**
 * LowStockWidget — RSC presentational component.
 *
 * Displays low-stock products (stock_actual < stock_minimo) with a count badge
 * and links to the products page. Mobile-first layout.
 *
 * Colored header: danger red — draws operator attention immediately.
 */

import Link from 'next/link';
import type { Product } from '@/lib/data/products';

interface Props {
  products: Product[];
}

export function LowStockWidget({ products }: Props) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      {/* Danger red header */}
      <div className="bg-danger px-6 py-4 flex items-center justify-between">
        <h2 className="font-bold text-white">⚠️ Stock bajo</h2>
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/20 text-white text-sm font-bold">
          {products.length}
        </span>
      </div>

      <div className="p-6 space-y-4">
        {products.length === 0 ? (
          <p className="text-sm text-gray-500">Todos los productos tienen stock suficiente</p>
        ) : (
          <ul className="space-y-2">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  href="/products"
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-red-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 truncate">{product.nombre}</span>
                  <span className="ml-2 text-xs font-bold text-danger whitespace-nowrap">
                    {product.stock_actual} / {product.stock_minimo}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
