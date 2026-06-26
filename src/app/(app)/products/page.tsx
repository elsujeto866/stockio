/**
 * Products list page — RSC.
 *
 * Fetches all active products for the authenticated tenant and renders
 * them via ProductList. RLS scopes the query to the current tenant.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getProducts } from '@/lib/data/products';
import { ProductList } from '@/components/products/ProductList';

export default async function ProductsPage() {
  await requireUser();
  const supabase = await createClient();
  const products = await getProducts(supabase);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Products</h1>
          <Link
            href="/products/new"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors min-h-[44px]"
          >
            + New product
          </Link>
        </div>

        <ProductList products={products} />
      </div>
    </main>
  );
}
