/**
 * Catalog page — RSC.
 *
 * Displays all active products grouped by categoria, intended for printing
 * as a "Guía de productos" (product reference sheet).
 *
 * REQ-1 (S1-1, S1-2): protected by requireUser() — unauthenticated → /login.
 * REQ-2 (S2-1, S2-2): getCatalogProducts filters activo=true.
 * REQ-3 (S3-1, S3-2): groupByCategoria groups + sorts NULL bucket last.
 * REQ-7 (S7-1): friendly empty state when no active products exist.
 * REQ-6 (S6-1..S6-4): print:hidden on Sidebar+header (AppShell), per-section
 *   print:break-before-page (CatalogCategorySection), per-card
 *   print:break-inside-avoid (CatalogProductCard), eager image loading (ADR-3).
 *
 * No N+1: a single batched getSignedUrls call resolves all photo URLs.
 */

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getCatalogProducts, getSignedUrls } from '@/lib/data/products';
import { groupByCategoria } from '@/lib/catalog/groupByCategoria';
import { CatalogCategorySection } from '@/components/catalog/CatalogCategorySection';

export default async function CatalogoPage() {
  await requireUser();
  const supabase = await createClient();

  const products = await getCatalogProducts(supabase);

  // Batch resolve signed URLs — one call, no N+1 (REQ-7 / S4-1)
  const imagePaths = products
    .map((p) => p.image_path)
    .filter((p): p is string => !!p);
  const photoUrls = await getSignedUrls(supabase, imagePaths);

  const groups = groupByCategoria(products);

  // REQ-7 / S7-1: friendly empty state
  if (products.length === 0) {
    return (
      <main className="min-h-screen bg-cream">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-gray-900">Catálogo</h1>
          <p className="text-gray-500 mt-4">No hay productos activos para mostrar.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen print:min-h-0 bg-cream print:bg-white">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900 print:text-xl">Catálogo</h1>

        {groups.map(([categoria, items], i) => (
          <CatalogCategorySection
            key={categoria}
            categoria={categoria}
            products={items}
            photoUrls={photoUrls}
            isFirst={i === 0}
          />
        ))}
      </div>
    </main>
  );
}
