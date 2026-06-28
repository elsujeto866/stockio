/**
 * StoreCard — RSC presentational component.
 *
 * Displays a single store with:
 *  - nombre (required)
 *  - contacto, direccion, telefono (optional — only shown when non-null)
 *  - Edit link and inline delete form
 *
 * No LowStockBadge, no stock-adjust link — stores have no inventory logic.
 * Mobile-first card layout with brand accent stripe.
 */

import Link from 'next/link';
import type { Store } from '@/lib/data/stores';
import { deleteStoreAction } from '@/app/(app)/stores/actions';

interface Props {
  store: Store;
}

export function StoreCard({ store }: Props) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      {/* Thin brand accent stripe */}
      <div className="h-1 bg-brand" />

      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">{store.nombre}</h2>
        </div>

        {/* Optional details */}
        {(store.contacto || store.direccion || store.telefono) && (
          <div className="flex flex-col gap-0.5 text-sm text-gray-500">
            {store.contacto && (
              <p>
                <span className="font-medium text-gray-700">Contacto: </span>
                {store.contacto}
              </p>
            )}
            {store.direccion && (
              <p>
                <span className="font-medium text-gray-700">Dirección: </span>
                {store.direccion}
              </p>
            )}
            {store.telefono && (
              <p>
                <span className="font-medium text-gray-700">Teléfono: </span>
                {store.telefono}
              </p>
            )}
          </div>
        )}

        {/* Action row — touch-target sized buttons (min 44px) */}
        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/stores/${store.id}`}
            className="btn-primary px-3 py-2.5 text-sm"
          >
            Ver saldo
          </Link>
          <Link
            href={`/stores/${store.id}/edit`}
            className="btn-secondary px-3 py-2.5 text-sm"
          >
            Editar
          </Link>
          <form action={deleteStoreAction} className="ml-auto">
            <input type="hidden" name="id" value={store.id} />
            <button
              type="submit"
              className="btn-danger px-3 py-2.5 text-sm"
            >
              Eliminar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
