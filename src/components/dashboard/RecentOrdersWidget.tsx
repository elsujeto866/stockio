/**
 * RecentOrdersWidget — RSC presentational component.
 *
 * Displays the 5 most recent orders with store name, fecha, estado badge, and total.
 * Each row links to the order detail page. Mobile-first layout.
 *
 * ESTADO_BADGE is duplicated here (not imported from OrderCard) to keep
 * widgets presentationally independent — see design decision #5.
 */

import Link from 'next/link';
import type { OrderListItem } from '@/lib/data/orders';
import { formatCurrency, formatDate } from '@/lib/format';

interface Props {
  orders: OrderListItem[];
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

export function RecentOrdersWidget({ orders }: Props) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 space-y-4">
      <h2 className="font-semibold text-gray-900">Pedidos recientes</h2>

      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">No hay pedidos todavía</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => {
            const badge = ESTADO_BADGE[order.estado] ?? {
              label: order.estado,
              className: 'bg-gray-100 text-gray-500 border border-gray-200',
            };

            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-gray-900 truncate">
                      {order.store?.nombre ?? 'Tienda desconocida'}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(order.fecha)}</p>
                  </div>
                  <div className="ml-2 flex items-center gap-2 shrink-0">
                    <span
                      role="status"
                      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {order.total !== null ? formatCurrency(order.total) : '—'}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
