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
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-3">
        <p className="text-gray-500 text-sm">No stores yet.</p>
        <Link
          href="/stores/new"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors min-h-[44px]"
        >
          Add your first store
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Store list">
      {stores.map((store) => (
        <li key={store.id}>
          <StoreCard store={store} />
        </li>
      ))}
    </ul>
  );
}
