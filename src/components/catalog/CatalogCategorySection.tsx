/**
 * CatalogCategorySection — RSC presentational component.
 *
 * Renders a category heading + responsive grid of CatalogProductCard.
 *
 * Print behaviour (ADR-2):
 *  - print:break-before-page on section wrapper (suppressed for isFirst=true
 *    to avoid a leading blank print page)
 *  - Forced print:grid-cols-3 for dense, paper-friendly layout
 */

import type { Product } from '@/lib/data/products';
import { CatalogProductCard } from './CatalogProductCard';

interface Props {
  categoria: string;
  products: Product[];
  /** Map<image_path, signedUrl> — resolved by the RSC page in one batch call */
  photoUrls: Map<string, string>;
  /** When true, suppresses print:break-before-page to avoid a leading blank page */
  isFirst?: boolean;
}

export function CatalogCategorySection({
  categoria,
  products,
  photoUrls,
  isFirst = false,
}: Props) {
  return (
    <section
      className={[
        isFirst ? '' : 'print:break-before-page',
        'space-y-3',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <h2 className="text-lg font-semibold text-brand print:text-black border-b border-gray-200 pb-1">
        {categoria}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-3 print:gap-3">
        {products.map((p) => (
          <CatalogProductCard
            key={p.id}
            product={p}
            photoUrl={p.image_path ? (photoUrls.get(p.image_path) ?? null) : null}
          />
        ))}
      </div>
    </section>
  );
}
