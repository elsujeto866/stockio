/**
 * CatalogProductCard — RSC presentational component.
 *
 * Displays a single product in the "Guía de productos" catalog.
 *
 * NULL-GUARD RULE (REQ-4 / S4-2):
 *   Optional fields render ONLY when non-null.
 *   The card MUST NEVER show "Cód. null", "U. x null", "Vida útil null días",
 *   or an empty presentacion chip.
 *
 * ADR-3: ProductThumbnail is rendered with loading="eager" so photos are
 * fetched before the synchronous browser Print dialog captures the page.
 */

import type { Product } from '@/lib/data/products';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { formatCurrency } from '@/lib/format';

interface Props {
  product: Product;
  /** Resolved signed URL for the product photo. NULL renders a placeholder. */
  photoUrl: string | null;
}

export function CatalogProductCard({ product, photoUrl }: Props) {
  return (
    <article
      className={[
        'rounded-2xl bg-white border border-gray-100 shadow-sm p-4 flex flex-col gap-2',
        'print:break-inside-avoid print:shadow-none print:border-gray-300',
      ].join(' ')}
    >
      {/* Photo — eager-loaded for print fidelity (ADR-3) */}
      <ProductThumbnail
        url={photoUrl}
        alt={product.nombre}
        size={120}
        loading="eager"
        className="w-full !h-32 object-cover"
      />

      {/* Product name */}
      <h3 className="font-semibold text-gray-900 text-sm leading-tight">{product.nombre}</h3>

      {/* Price — always present (precio_unitario is NOT NULL) */}
      <p className="text-brand font-bold text-sm">
        P.V.P {formatCurrency(product.precio_unitario)}
      </p>

      {/* Optional chips — each guarded by truthiness check */}
      <div className="flex flex-wrap gap-1.5 text-xs text-gray-600">
        {product.presentacion && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5">
            {product.presentacion}
          </span>
        )}
        {product.sku && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5">
            Cód. {product.sku}
          </span>
        )}
        {product.units_per_package && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5">
            U. x {product.units_per_package}
          </span>
        )}
        {product.shelf_life_days && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5">
            Vida útil {product.shelf_life_days} días
          </span>
        )}
      </div>
    </article>
  );
}
