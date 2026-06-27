/**
 * Edit supplier page — RSC.
 *
 * Loads the supplier by id, then renders SupplierForm in edit mode.
 * Returns 404 if the supplier is not found or RLS blocks access.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getSupplier } from '@/lib/data/suppliers';
import { SupplierForm } from '@/components/suppliers/SupplierForm';
import { updateSupplierAction } from '@/app/(app)/suppliers/actions';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditSupplierPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const supplier = await getSupplier(supabase, id);

  if (!supplier) notFound();

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/suppliers"
            className="text-sm text-brand hover:text-brand-dark font-medium"
          >
            ← Proveedores
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Editar proveedor</h1>
        </div>

        <SupplierForm action={updateSupplierAction} initialData={supplier} />
      </div>
    </main>
  );
}
