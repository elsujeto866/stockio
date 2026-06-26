/**
 * StoreList — RSC presentational component.
 *
 * Maps an array of active stores to StoreCard components.
 * Shows an empty state with a "Add your first store" link when the list is empty.
 */

import type { Store } from '@/lib/data/stores';
import { StoreCard } from './StoreCard';
import Link from 'next/link';

interface Props {
  stores: Store[];
}

export function StoreList({ stores }: Props) {
  if (stores.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-3">
        <p className="text-3xl">🏪</p>
        <p className="text-gray-500 text-sm">No hay tiendas todavía</p>
        <Link
          href="/stores/new"
          className="btn-primary"
        >
          Agrega tu primera tienda
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Lista de tiendas">
      {stores.map((store) => (
        <li key={store.id}>
          <StoreCard store={store} />
        </li>
      ))}
    </ul>
  );
}
