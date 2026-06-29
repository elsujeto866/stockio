/**
 * New purchase page — RSC.
 *
 * Fetches active suppliers (getSuppliers filters activo=true) and all products
 * for the authenticated tenant, then renders the stateful PurchaseBuilder.
 *
 * Satisfies: REQ-S2 (active suppliers only in dropdown), REQ-P1
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getSuppliers } from '@/lib/data/suppliers';
import { getProducts, getSignedUrls } from '@/lib/data/products';
import { PurchaseBuilder } from '@/components/purchases/PurchaseBuilder';

export default async function NewPurchasePage() {
  await requireUser();
  const supabase = await createClient();

  const [suppliers, products] = await Promise.all([
    getSuppliers(supabase),
    getProducts(supabase),
  ]);

  // REQ-4 (S4-1): ONE batch call for all products — no N+1.
  const imagePaths = products
    .map((p) => p.image_path)
    .filter((p): p is string => !!p);
  const photoUrlMap = await getSignedUrls(supabase, imagePaths);

  // Convert Map<path, url> to Record<productId, url>
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
            href="/purchases"
            className="text-sm text-brand hover:text-brand-dark font-medium transition-colors"
          >
            ← Compras
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Nueva compra</h1>
        </div>

        <PurchaseBuilder suppliers={suppliers} products={products} photoUrls={photoUrls} />
      </div>
    </main>
  );
}
