/**
 * ProductCard — RSC presentational component.
 *
 * Displays a single product with:
 *  - Name, SKU, category, unit price, stock
 *  - LowStockBadge when stock_actual < stock_minimo (R6)
 *  - Links to edit and stock-adjust pages
 *  - Inline delete form (soft-delete via deleteProductAction, R4)
 *
 * Mobile-first card layout.
 */

import Link from 'next/link';
import type { Product } from '@/lib/data/products';
import { LowStockBadge } from './LowStockBadge';
import { deleteProductAction } from '@/app/(app)/products/actions';

interface Props {
  product: Product;
}

export function ProductCard({ product }: Props) {
  return (
    <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">{product.nombre}</h2>
          {product.sku && (
            <p className="text-xs text-gray-500 mt-0.5">SKU: {product.sku}</p>
          )}
          {product.categoria && (
            <p className="text-xs text-gray-400">{product.categoria}</p>
          )}
        </div>
        <LowStockBadge product={product} />
      </div>

      {/* Stock row */}
      <div className="flex items-center gap-4 text-sm">
        <div>
          <span className="text-gray-500">Stock: </span>
          <span className="font-medium text-gray-900">
            {product.stock_actual}
            {product.unidad_medida ? ` ${product.unidad_medida}` : ''}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Min: </span>
          <span className="font-medium text-gray-700">{product.stock_minimo}</span>
        </div>
        <div>
          <span className="text-gray-500">Price: </span>
          <span className="font-medium text-gray-900">
            ${product.precio_unitario.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Action row — touch-target sized buttons/links (min 44px) */}
      <div className="flex items-center gap-2 pt-1">
        <Link
          href={`/products/${product.id}/edit`}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors min-h-[44px]"
        >
          Edit
        </Link>
        <Link
          href={`/products/${product.id}/adjust`}
          className="inline-flex items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors min-h-[44px]"
        >
          Adjust stock
        </Link>
        <form action={deleteProductAction} className="ml-auto">
          <input type="hidden" name="id" value={product.id} />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors min-h-[44px]"
          >
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
