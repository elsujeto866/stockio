/**
 * Stock adjustment page — RSC.
 *
 * Loads the product by id, then renders StockAdjustForm.
 * adjustStockAction handles validation → adjustStock seam → redirect.
 * StockUnderflowError is surfaced as an inline error banner in the form.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getProduct } from '@/lib/data/products';
import { StockAdjustForm } from '@/components/products/StockAdjustForm';
import { adjustStockAction } from '@/app/(app)/products/actions';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdjustStockPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const product = await getProduct(supabase, id);

  if (!product) notFound();

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Products
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">
            Adjust stock
          </h1>
        </div>

        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
          <p className="font-semibold text-gray-900">{product.nombre}</p>
          {product.sku && (
            <p className="text-xs text-gray-500 mt-0.5">SKU: {product.sku}</p>
          )}
        </div>

        <StockAdjustForm action={adjustStockAction} product={product} />
      </div>
    </main>
  );
}
