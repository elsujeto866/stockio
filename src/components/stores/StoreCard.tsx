/**
 * StoreCard — RSC presentational component.
 *
 * Displays a single store with:
 *  - nombre (required)
 *  - contacto, direccion, telefono (optional — only shown when non-null)
 *  - Edit link and inline delete form
 *
 * No LowStockBadge, no stock-adjust link — stores have no inventory logic.
 * Mobile-first card layout.
 */

import Link from 'next/link';
import type { Store } from '@/lib/data/stores';
import { deleteStoreAction } from '@/app/(app)/stores/actions';

interface Props {
  store: Store;
}

export function StoreCard({ store }: Props) {
  return (
    <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4 space-y-3">
      {/* Header row */}
      <div className="min-w-0">
        <h2 className="font-semibold text-gray-900 truncate">{store.nombre}</h2>
      </div>

      {/* Optional details */}
      {(store.contacto || store.direccion || store.telefono) && (
        <div className="flex flex-col gap-0.5 text-sm text-gray-500">
          {store.contacto && (
            <p>
              <span className="font-medium text-gray-700">Contact: </span>
              {store.contacto}
            </p>
          )}
          {store.direccion && (
            <p>
              <span className="font-medium text-gray-700">Address: </span>
              {store.direccion}
            </p>
          )}
          {store.telefono && (
            <p>
              <span className="font-medium text-gray-700">Phone: </span>
              {store.telefono}
            </p>
          )}
        </div>
      )}

      {/* Action row — touch-target sized buttons/links (min 44px) */}
      <div className="flex items-center gap-2 pt-1">
        <Link
          href={`/stores/${store.id}/edit`}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors min-h-[44px]"
        >
          Edit
        </Link>
        <form action={deleteStoreAction} className="ml-auto">
          <input type="hidden" name="id" value={store.id} />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors min-h-[44px]"
          >
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
