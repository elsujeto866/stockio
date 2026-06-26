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
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Stores</h1>
          <Link
            href="/stores/new"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors min-h-[44px]"
          >
            + New store
          </Link>
        </div>

        <StoreList stores={stores} />
      </div>
    </main>
  );
}
