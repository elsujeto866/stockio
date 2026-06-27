/**
 * SupplierCard — RSC presentational component.
 *
 * Displays a single supplier with:
 *  - nombre (required)
 *  - contacto, telefono (optional — only shown when non-null)
 *  - Edit link and inline deactivate form
 *
 * Soft-delete only — no hard DELETE button.
 * Purchases FK RESTRICT means hard delete at the DB level would fail anyway.
 */

import Link from 'next/link';
import type { Supplier } from '@/lib/data/suppliers';
import { deactivateSupplierAction } from '@/app/(app)/suppliers/actions';

interface Props {
  supplier: Supplier;
}

export function SupplierCard({ supplier }: Props) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      {/* Thin brand accent stripe */}
      <div className="h-1 bg-brand" />

      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">{supplier.nombre}</h2>
          {supplier.ruc && (
            <p className="text-xs text-gray-500">RUC: {supplier.ruc}</p>
          )}
        </div>

        {/* Optional details */}
        {(supplier.contacto || supplier.telefono) && (
          <div className="flex flex-col gap-0.5 text-sm text-gray-500">
            {supplier.contacto && (
              <p>
                <span className="font-medium text-gray-700">Contacto: </span>
                {supplier.contacto}
              </p>
            )}
            {supplier.telefono && (
              <p>
                <span className="font-medium text-gray-700">Teléfono: </span>
                {supplier.telefono}
              </p>
            )}
          </div>
        )}

        {/* Action row — touch-target sized buttons (min 44px) */}
        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/suppliers/${supplier.id}/edit`}
            className="btn-secondary px-3 py-2.5 text-sm"
          >
            Editar
          </Link>
          <form action={deactivateSupplierAction} className="ml-auto">
            <input type="hidden" name="id" value={supplier.id} />
            <button
              type="submit"
              className="btn-danger px-3 py-2.5 text-sm"
            >
              Desactivar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
