/**
 * PurchaseCard — RSC presentational component.
 *
 * Displays a single purchase summary card with:
 *  - Supplier nombre (from joined supplier relation)
 *  - Purchase fecha
 *  - Estado badge (recibido=green / cancelado=gray) — vibrant color pills
 *  - Total formatted as currency
 *
 * The entire card is wrapped in a Link to the purchase detail page.
 * Mirrors OrderCard for layout consistency.
 */

import Link from 'next/link';
import type { PurchaseListItem } from '@/lib/data/purchases';
import { formatCurrency, formatDate } from '@/lib/format';

interface Props {
  purchase: PurchaseListItem;
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  recibido: {
    label: 'Recibido',
    className: 'bg-success text-white',
  },
  cancelado: {
    label: 'Cancelado',
    className: 'bg-gray-300 text-gray-700',
  },
};

export function PurchaseCard({ purchase }: Props) {
  const badge = ESTADO_BADGE[purchase.estado] ?? {
    label: purchase.estado,
    className: 'bg-gray-200 text-gray-700',
  };

  return (
    <Link
      href={`/purchases/${purchase.id}`}
      className="block rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden hover:border-brand transition-colors"
    >
      <div className="h-1 bg-brand" />
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 truncate">
              {purchase.supplier?.nombre ?? 'Proveedor desconocido'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{formatDate(purchase.fecha)}</p>
          </div>
          <span
            role="status"
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        <div className="text-sm">
          <span className="text-gray-500">Total: </span>
          <span className="font-semibold text-info">
            {purchase.total !== null ? formatCurrency(purchase.total) : '—'}
          </span>
        </div>
      </div>
    </Link>
  );
}
