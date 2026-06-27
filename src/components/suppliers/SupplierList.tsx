/**
 * SupplierList — RSC presentational component.
 *
 * Maps an array of active suppliers to SupplierCard components.
 * Shows an empty state message when the list is empty.
 */

import type { Supplier } from '@/lib/data/suppliers';
import { SupplierCard } from './SupplierCard';
import Link from 'next/link';

interface Props {
  suppliers: Supplier[];
}

export function SupplierList({ suppliers }: Props) {
  if (suppliers.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-3">
        <p className="text-3xl">🏭</p>
        <p className="text-gray-500 text-sm">No hay proveedores registrados</p>
        <Link
          href="/suppliers/new"
          className="btn-primary"
        >
          Agrega tu primer proveedor
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Lista de proveedores">
      {suppliers.map((supplier) => (
        <li key={supplier.id}>
          <SupplierCard supplier={supplier} />
        </li>
      ))}
    </ul>
  );
}
