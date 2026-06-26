/**
 * RecentOrdersWidget — RSC presentational component.
 *
 * Displays the 5 most recent orders with store name, fecha, estado badge, and total.
 * Each row links to the order detail page. Mobile-first layout.
 *
 * Colored header: info blue — highlights the active pulse of the business.
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
    className: 'bg-warning text-amber-900',
  },
  entregado: {
    label: 'Entregado',
    className: 'bg-success text-white',
  },
  cancelado: {
    label: 'Cancelado',
    className: 'bg-danger text-white',
  },
};

export function RecentOrdersWidget({ orders }: Props) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      {/* Info blue header */}
      <div className="bg-info px-6 py-4">
        <h2 className="font-bold text-white">📦 Pedidos recientes</h2>
      </div>

      <div className="p-6 space-y-4">
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500">No hay pedidos todavía</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => {
              const badge = ESTADO_BADGE[order.estado] ?? {
                label: order.estado,
                className: 'bg-gray-200 text-gray-700',
              };

              return (
                <li key={order.id}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
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
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-sm font-semibold text-info">
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
    </div>
  );
}
