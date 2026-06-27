/**
 * New supplier page — RSC.
 *
 * Renders SupplierForm in create mode.
 * createSupplierAction handles validation → seam call → redirect.
 */

import Link from 'next/link';
import { requireUser } from '@/lib/auth/get-user';
import { SupplierForm } from '@/components/suppliers/SupplierForm';
import { createSupplierAction } from '@/app/(app)/suppliers/actions';

export default async function NewSupplierPage() {
  await requireUser();

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
          <h1 className="text-2xl font-bold text-gray-900">Nuevo proveedor</h1>
        </div>

        <SupplierForm action={createSupplierAction} />
      </div>
    </main>
  );
}
