/**
 * New product page — RSC.
 *
 * Renders ProductForm in create mode.
 * createProductAction handles validation → seam call → redirect.
 */

import Link from 'next/link';
import { requireUser } from '@/lib/auth/get-user';
import { ProductForm } from '@/components/products/ProductForm';
import { createProductAction } from '@/app/(app)/products/actions';

export default async function NewProductPage() {
  await requireUser();

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Products
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">New product</h1>
        </div>

        <ProductForm action={createProductAction} />
      </div>
    </main>
  );
}
