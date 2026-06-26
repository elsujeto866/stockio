/**
 * New store page — RSC.
 *
 * Renders StoreForm in create mode.
 * createStoreAction handles validation → seam call → redirect.
 */

import Link from 'next/link';
import { requireUser } from '@/lib/auth/get-user';
import { StoreForm } from '@/components/stores/StoreForm';
import { createStoreAction } from '@/app/(app)/stores/actions';

export default async function NewStorePage() {
  await requireUser();

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/stores"
            className="text-sm text-brand hover:text-brand-dark font-medium"
          >
            ← Tiendas
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Nueva tienda</h1>
        </div>

        <StoreForm action={createStoreAction} />
      </div>
    </main>
  );
}
