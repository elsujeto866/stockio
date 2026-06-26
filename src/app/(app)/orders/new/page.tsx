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
import { getProducts } from '@/lib/data/products';
import { OrderBuilder } from '@/components/orders/OrderBuilder';

export default async function NewOrderPage() {
  await requireUser();
  const supabase = await createClient();

  const [stores, products] = await Promise.all([
    getStores(supabase),
    getProducts(supabase),
  ]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Orders
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">New Order</h1>
        </div>

        <OrderBuilder stores={stores} products={products} />
      </div>
    </main>
  );
}
