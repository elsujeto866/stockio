'use client';

/**
 * OrderFilters — Client component.
 *
 * Renders a store select and from/to date inputs that push updated URL
 * search params via next/navigation's useRouter. The page (RSC parent) reads
 * these params via searchParams and filters orders server-side.
 *
 * Touch targets are ≥44px.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import type { Store } from '@/lib/data/stores';

interface Props {
  stores: Store[];
}

export function OrderFilters({ stores }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/orders?${params.toString()}`);
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3">
      {/* Store filter */}
      <div className="flex flex-col gap-1 min-w-[160px]">
        <label
          htmlFor="store-filter"
          className="text-xs font-semibold text-brand uppercase tracking-wide"
        >
          Filtrar por tienda
        </label>
        <select
          id="store-filter"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand min-h-[44px]"
          value={searchParams.get('store') ?? ''}
          onChange={(e) => updateParam('store', e.target.value)}
        >
          <option value="">Todas las tiendas</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* From date filter */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="from-filter"
          className="text-xs font-semibold text-brand uppercase tracking-wide"
        >
          Desde
        </label>
        <input
          id="from-filter"
          type="date"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand min-h-[44px]"
          value={searchParams.get('from') ?? ''}
          onChange={(e) => updateParam('from', e.target.value)}
        />
      </div>

      {/* To date filter */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="to-filter"
          className="text-xs font-semibold text-brand uppercase tracking-wide"
        >
          Hasta
        </label>
        <input
          id="to-filter"
          type="date"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand min-h-[44px]"
          value={searchParams.get('to') ?? ''}
          onChange={(e) => updateParam('to', e.target.value)}
        />
      </div>
    </div>
  );
}
