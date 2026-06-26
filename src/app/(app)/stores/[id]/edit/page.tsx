/**
 * Edit store page — RSC.
 *
 * Loads the store by id, then renders StoreForm in edit mode.
 * Returns 404 if the store is not found or RLS blocks access.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getStore } from '@/lib/data/stores';
import { StoreForm } from '@/components/stores/StoreForm';
import { updateStoreAction } from '@/app/(app)/stores/actions';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditStorePage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const store = await getStore(supabase, id);

  if (!store) notFound();

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/stores"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Tiendas
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Editar tienda</h1>
        </div>

        <StoreForm action={updateStoreAction} initialData={store} />
      </div>
    </main>
  );
}
