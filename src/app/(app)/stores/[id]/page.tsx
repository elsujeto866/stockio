/**
 * Store detail page — RSC.
 *
 * AR-T26: New page that shows store info and outstanding balance (REQ-4/S4-1).
 *
 * Fetches store by id and computes outstanding balance via getStoreBalance.
 * Calls notFound() when store is not found or RLS blocks access.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getStore, getStoreBalance } from '@/lib/data/stores';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StoreDetailPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [store, balance] = await Promise.all([
    getStore(supabase, id),
    getStoreBalance(supabase, id),
  ]);

  if (!store) notFound();

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/stores"
            className="text-sm text-brand hover:text-brand-dark font-medium transition-colors"
          >
            ← Tiendas
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{store.nombre}</h1>
        </div>

        {/* Store info */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Información</h2>
          {store.contacto && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Contacto:</span> {store.contacto}
            </p>
          )}
          {store.direccion && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Dirección:</span> {store.direccion}
            </p>
          )}
          {store.telefono && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Teléfono:</span> {store.telefono}
            </p>
          )}
          <p className="text-sm text-gray-600">
            <span className="font-medium">Plazo de pago:</span>{' '}
            {store.payment_terms_days} días
          </p>
        </div>

        {/* Outstanding balance section (REQ-4/S4-1) */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Saldo por cobrar</h2>
          <p className="text-3xl font-bold text-gray-900">${balance.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">
            Total de facturas pendientes de cobro (excluye pedidos cancelados)
          </p>
          <div className="mt-4">
            <Link
              href="/receivables"
              className="text-sm text-brand hover:text-brand-dark font-medium transition-colors"
            >
              Ver detalle por antigüedad →
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            href={`/stores/${store.id}/edit`}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
          >
            Editar tienda
          </Link>
        </div>
      </div>
    </main>
  );
}
