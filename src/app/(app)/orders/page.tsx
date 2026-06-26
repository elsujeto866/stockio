/**
 * Orders list/history page — RSC.
 *
 * Reads optional search params (store, from, to) to filter orders.
 * Fetches orders and stores in parallel, then renders:
 *   - OrderFilters (Client) for URL-param driven filtering
 *   - OrderList (RSC) for the paginated order cards
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getOrders } from '@/lib/data/orders';
import { getStores } from '@/lib/data/stores';
import { OrderList } from '@/components/orders/OrderList';
import { OrderFilters } from '@/components/orders/OrderFilters';

interface PageProps {
  searchParams: Promise<{ store?: string; from?: string; to?: string }>;
}

export default async function OrdersPage({ searchParams }: PageProps) {
  await requireUser();
  const supabase = await createClient();

  const params = await searchParams;

  const [orders, stores] = await Promise.all([
    getOrders(supabase, {
      storeId: params.store,
      from: params.from,
      to: params.to,
    }),
    getStores(supabase),
  ]);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <Link
            href="/orders/new"
            className="btn-primary"
          >
            + Nuevo pedido
          </Link>
        </div>

        <OrderFilters stores={stores} />
        <OrderList orders={orders} />
      </div>
    </main>
  );
}
