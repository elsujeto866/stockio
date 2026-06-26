/**
 * ProductCard — RSC presentational component.
 *
 * Displays a single product with:
 *  - Name, SKU, category, unit price, stock
 *  - LowStockBadge when stock_actual < stock_minimo (R6)
 *  - Links to edit and stock-adjust pages
 *  - Inline delete form (soft-delete via deleteProductAction, R4)
 *
 * Mobile-first card layout with brand accent stripe.
 */

import Link from 'next/link';
import type { Product } from '@/lib/data/products';
import { LowStockBadge } from './LowStockBadge';
import { deleteProductAction } from '@/app/(app)/products/actions';
import { formatCurrency } from '@/lib/format';

interface Props {
  product: Product;
}

export function ProductCard({ product }: Props) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      {/* Thin brand accent stripe */}
      <div className="h-1 bg-brand" />

      <div className="p-4 space-y-3">
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
            <span className="text-gray-500">Mín: </span>
            <span className="font-medium text-gray-700">{product.stock_minimo}</span>
          </div>
          <div>
            <span className="text-gray-500">Precio: </span>
            <span className="font-semibold text-info">
              {formatCurrency(product.precio_unitario)}
            </span>
          </div>
        </div>

        {/* Action row — touch-target sized buttons (min 44px) */}
        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/products/${product.id}/edit`}
            className="btn-secondary px-3 py-2.5 text-sm"
          >
            Editar
          </Link>
          <Link
            href={`/products/${product.id}/adjust`}
            className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-medium text-info hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-info focus:ring-offset-2 transition-colors min-h-[44px]"
          >
            Ajustar stock
          </Link>
          <form action={deleteProductAction} className="ml-auto">
            <input type="hidden" name="id" value={product.id} />
            <button
              type="submit"
              className="btn-danger px-3 py-2.5 text-sm"
            >
              Eliminar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
