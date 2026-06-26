/**
 * Stores list page — RSC.
 *
 * Fetches all active stores for the authenticated tenant and renders
 * them via StoreList. RLS scopes the query to the current tenant.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getStores } from '@/lib/data/stores';
import { StoreList } from '@/components/stores/StoreList';

export default async function StoresPage() {
  await requireUser();
  const supabase = await createClient();
  const stores = await getStores(supabase);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Tiendas</h1>
          <Link
            href="/stores/new"
            className="btn-primary"
          >
            + Nueva tienda
          </Link>
        </div>

        <StoreList stores={stores} />
      </div>
    </main>
  );
}
