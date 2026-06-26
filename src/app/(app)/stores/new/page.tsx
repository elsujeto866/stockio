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
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/stores"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Stores
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">New store</h1>
        </div>

        <StoreForm action={createStoreAction} />
      </div>
    </main>
  );
}
