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

        <ProductList products={products} />
      </div>
    </main>
  );
}
