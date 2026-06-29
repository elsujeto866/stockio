/**
 * New order page — RSC.
 *
 * Fetches all active stores and products for the authenticated tenant, then
 * renders the stateful OrderBuilder Client component.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getStores } from '@/lib/data/stores';
import { getProducts, getSignedUrls } from '@/lib/data/products';
import { OrderBuilder } from '@/components/orders/OrderBuilder';

export default async function NewOrderPage() {
  await requireUser();
  const supabase = await createClient();

  const [stores, products] = await Promise.all([
    getStores(supabase),
    getProducts(supabase),
  ]);

  // REQ-4 (S4-1): ONE batch call for all products — no N+1.
  const imagePaths = products
    .map((p) => p.image_path)
    .filter((p): p is string => !!p);
  const photoUrlMap = await getSignedUrls(supabase, imagePaths);

  // Convert Map<path, url> to Record<productId, url> for the client component.
  // The path is {tenant_id}/{product_id}.jpg; we match by product.image_path.
  const photoUrls: Record<string, string> = {};
  for (const p of products) {
    if (p.image_path) {
      const url = photoUrlMap.get(p.image_path);
      if (url) photoUrls[p.id] = url;
    }
  }

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="text-sm text-brand hover:text-brand-dark font-medium transition-colors"
          >
            ← Pedidos
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo pedido</h1>
        </div>

        <OrderBuilder stores={stores} products={products} photoUrls={photoUrls} />
      </div>
    </main>
  );
}
