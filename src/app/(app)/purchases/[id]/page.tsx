/**
 * Purchase detail page — RSC.
 *
 * Fetches a single purchase with all line items, or 404 if not found.
 * Satisfies: REQ-V2 (purchase detail view), REQ-P2 (cancel UX via CancelPurchaseButton).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getPurchase } from '@/lib/data/purchases';
import { PurchaseDetail } from '@/components/purchases/PurchaseDetail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseDetailPage({ params }: PageProps) {
  await requireUser();
  const supabase = await createClient();

  const { id } = await params;
  const purchase = await getPurchase(supabase, id);

  if (!purchase) notFound();

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
          <h1 className="text-2xl font-bold text-gray-900">Detalle de compra</h1>
        </div>

        <PurchaseDetail purchase={purchase} />
      </div>
    </main>
  );
}
