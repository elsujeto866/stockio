/**
 * Suppliers list page — RSC.
 *
 * Fetches all active suppliers for the authenticated tenant and renders
 * them via SupplierList. RLS scopes the query to the current tenant.
 */

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getSuppliers } from '@/lib/data/suppliers';
import { SupplierList } from '@/components/suppliers/SupplierList';

export default async function SuppliersPage() {
  await requireUser();
  const supabase = await createClient();
  const suppliers = await getSuppliers(supabase);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
          <Link
            href="/suppliers/new"
            className="btn-primary"
          >
            + Nuevo proveedor
          </Link>
        </div>

        <SupplierList suppliers={suppliers} />
      </div>
    </main>
  );
}
