/**
 * OrderCard — RSC presentational component.
 *
 * Displays a single order summary card with:
 *  - Store nombre (from the joined store relation)
 *  - Order fecha
 *  - Estado badge (Pending / Delivered / Cancelled)
 *  - Total formatted as currency
 *
 * The entire card is wrapped in a Link to the order detail page.
 * Mobile-first layout, consistent with ProductCard / StoreCard.
 */

import Link from 'next/link';
import type { OrderListItem } from '@/lib/data/orders';
import { formatCurrency, formatDate } from '@/lib/format';

interface Props {
  order: OrderListItem;
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: {
    label: 'Pendiente',
    className: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  },
  entregado: {
    label: 'Entregado',
    className: 'bg-green-100 text-green-700 border border-green-200',
  },
  cancelado: {
    label: 'Cancelado',
    className: 'bg-gray-100 text-gray-500 border border-gray-200',
  },
};

export function OrderCard({ order }: Props) {
  const badge = ESTADO_BADGE[order.estado] ?? {
    label: order.estado,
    className: 'bg-gray-100 text-gray-500 border border-gray-200',
  };

  return (
    <Link
      href={`/orders/${order.id}`}
      className="block rounded-xl bg-white shadow-sm border border-gray-100 p-4 space-y-2 hover:border-blue-200 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">
            {order.store?.nombre ?? 'Tienda desconocida'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{formatDate(order.fecha)}</p>
        </div>
        <span
          role="status"
          className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="text-sm">
        <span className="text-gray-500">Total: </span>
        <span className="font-medium text-gray-900">
          {order.total !== null ? formatCurrency(order.total) : '—'}
        </span>
      </div>
    </Link>
  );
}
