/**
 * Products list page — RSC.
 *
 * Fetches all active products for the authenticated tenant and renders
 * them via ProductList. RLS scopes the query to the current tenant.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getProducts, getSignedUrls } from '@/lib/data/products';
import { ProductList } from '@/components/products/ProductList';

export default async function ProductsPage() {
  await requireUser();
  const supabase = await createClient();
  const products = await getProducts(supabase);

  // REQ-4 (S4-1): ONE batch call for all visible products — no N+1.
  // S4-2: null image_path filtered before the call.
  const imagePaths = products
    .map((p) => p.image_path)
    .filter((p): p is string => !!p);
  const photoUrls = await getSignedUrls(supabase, imagePaths);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <Link
            href="/products/new"
            className="btn-primary"
          >
            + Nuevo producto
          </Link>
        </div>

        <ProductList products={products} photoUrls={photoUrls} />
      </div>
    </main>
  );
}
