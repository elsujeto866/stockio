/**
 * Edit product page — RSC.
 *
 * Loads the product by id, then renders ProductForm in edit mode.
 * Redirects to /products if the product is not found or not accessible (RLS).
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getProduct, getSignedUrls } from '@/lib/data/products';
import { ProductForm } from '@/components/products/ProductForm';
import { updateProductAction } from '@/app/(app)/products/actions';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const [product, { data: tenantId }] = await Promise.all([
    getProduct(supabase, id),
    supabase.rpc('get_tenant_id'),
  ]);

  if (!product) notFound();

  // Resolve existing photo signed URL for the edit form preview
  const photoUrlMap = await getSignedUrls(
    supabase,
    product.image_path ? [product.image_path] : []
  );
  const initialImageUrl = product.image_path
    ? (photoUrlMap.get(product.image_path) ?? null)
    : null;

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="text-sm text-brand hover:text-brand-dark font-medium"
          >
            ← Productos
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Editar producto</h1>
        </div>

        <ProductForm
          action={updateProductAction}
          initialData={product}
          tenantId={tenantId ?? undefined}
          initialImageUrl={initialImageUrl}
        />
      </div>
    </main>
  );
}
