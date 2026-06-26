/**
 * OrderDetail — RSC presentational component.
 *
 * Displays full order information:
 *  - Store nombre + fecha + estado badge
 *  - Optional notas
 *  - Line items with frozen precio_unitario, cantidad, subtotal
 *  - Authoritative order.total (from the DB — may differ from current product prices)
 *  - Mark-as-delivered and Cancel order forms — ONLY when estado === 'pendiente'
 *
 * Mobile-first layout, consistent with the container/presentational pattern.
 */

import type { OrderDetail as OrderDetailType } from '@/lib/data/orders';
import { markDeliveredAction, cancelOrderAction } from '@/app/(app)/orders/actions';

interface Props {
  order: OrderDetailType;
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  },
  entregado: {
    label: 'Delivered',
    className: 'bg-green-100 text-green-700 border border-green-200',
  },
  cancelado: {
    label: 'Cancelled',
    className: 'bg-gray-100 text-gray-500 border border-gray-200',
  },
};

export function OrderDetail({ order }: Props) {
  const badge = ESTADO_BADGE[order.estado] ?? {
    label: order.estado,
    className: 'bg-gray-100 text-gray-500 border border-gray-200',
  };
  const isPending = order.estado === 'pendiente';

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 text-lg truncate">
              {order.store?.nombre ?? 'Unknown store'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{order.fecha}</p>
          </div>
          <span
            role="status"
            className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        {order.notas && (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            {order.notas}
          </p>
        )}
      </div>

      {/* ── Line items ───────────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 space-y-3">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Items
        </h2>

        <ul className="space-y-0 divide-y divide-gray-50" aria-label="Order items">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.product?.nombre ?? item.product_id}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm shrink-0">
                <span className="text-gray-500">×{item.cantidad}</span>
                <span className="text-gray-600">${item.precio_unitario.toFixed(2)}</span>
                <span className="font-medium text-gray-900 min-w-[64px] text-right">
                  ${item.subtotal.toFixed(2)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Authoritative total from DB */}
        <div className="flex justify-end pt-3 border-t border-gray-100">
          <p className="text-sm">
            <span className="text-gray-500">Total: </span>
            <span className="font-semibold text-gray-900 text-base">
              {order.total !== null ? `$${order.total.toFixed(2)}` : '—'}
            </span>
          </p>
        </div>
      </div>

      {/* ── Actions — only when estado === 'pendiente' ───────────── */}
      {isPending && (
        <div className="flex flex-wrap gap-3">
          <form action={markDeliveredAction}>
            <input type="hidden" name="id" value={order.id} />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors min-h-[44px]"
            >
              Mark as delivered
            </button>
          </form>

          <form action={cancelOrderAction}>
            <input type="hidden" name="id" value={order.id} />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors min-h-[44px]"
            >
              Cancel order
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
