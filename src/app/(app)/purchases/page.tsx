/**
 * Purchases list page — RSC.
 *
 * Fetches all purchases for the authenticated tenant, then renders
 * PurchaseCard components in a list. Satisfies REQ-V1.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getPurchases } from '@/lib/data/purchases';
import { PurchaseCard } from '@/components/purchases/PurchaseCard';

export default async function PurchasesPage() {
  await requireUser();
  const supabase = await createClient();

  const purchases = await getPurchases(supabase);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Compras</h1>
          <Link href="/purchases/new" className="btn-primary">
            + Nueva compra
          </Link>
        </div>

        {purchases.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No hay compras registradas.
          </p>
        ) : (
          <ul className="space-y-3">
            {purchases.map((purchase) => (
              <li key={purchase.id}>
                <PurchaseCard purchase={purchase} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
