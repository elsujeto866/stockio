/**
 * OrderDetail — RSC presentational component.
 *
 * Displays full order information:
 *  - Store nombre + fecha + estado badge
 *  - Optional notas
 *  - Line items with frozen precio_unitario, cantidad, subtotal
 *  - Authoritative order.total (from the DB — may differ from current product prices)
 *  - Mark-as-delivered and Cancel order forms — ONLY when estado === 'pendiente'
 *  - Invoice section:
 *    - "Generate invoice" form — when invoiceId is null AND estado !== 'cancelado'
 *    - "View invoice →" link — when invoiceId is provided
 *
 * Mobile-first layout, consistent with the container/presentational pattern.
 */

import Link from 'next/link';
import type { OrderDetail as OrderDetailType } from '@/lib/data/orders';
import { markDeliveredAction, cancelOrderAction } from '@/app/(app)/orders/actions';
import { GenerateInvoiceButton } from '@/components/orders/GenerateInvoiceButton';
import { formatCurrency, formatDate } from '@/lib/format';

interface Props {
  order: OrderDetailType;
  /** UUID of an existing invoice for this order, or null if none yet. */
  invoiceId?: string | null;
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

export function OrderDetail({ order, invoiceId = null }: Props) {
  const badge = ESTADO_BADGE[order.estado] ?? {
    label: order.estado,
    className: 'bg-gray-100 text-gray-500 border border-gray-200',
  };
  const isPending = order.estado === 'pendiente';
  const isCancelled = order.estado === 'cancelado';
  const canInvoice = !isCancelled;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 text-lg truncate">
              {order.store?.nombre ?? 'Tienda desconocida'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{formatDate(order.fecha)}</p>
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
          Artículos
        </h2>

        <ul className="space-y-0 divide-y divide-gray-50" aria-label="Artículos del pedido">
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
                <span className="text-gray-600">{formatCurrency(item.precio_unitario)}</span>
                <span className="font-medium text-gray-900 min-w-[64px] text-right">
                  {formatCurrency(item.subtotal)}
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
              {order.total !== null ? formatCurrency(order.total) : '—'}
            </span>
          </p>
        </div>
      </div>

      {/* ── Order actions — only when estado === 'pendiente' ────── */}
      {isPending && (
        <div className="flex flex-wrap gap-3">
          <form action={markDeliveredAction}>
            <input type="hidden" name="id" value={order.id} />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors min-h-[44px]"
            >
              Marcar como entregado
            </button>
          </form>

          <form action={cancelOrderAction}>
            <input type="hidden" name="id" value={order.id} />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors min-h-[44px]"
            >
              Cancelar pedido
            </button>
          </form>
        </div>
      )}

      {/* ── Invoice section ──────────────────────────────────────── */}
      {invoiceId !== null ? (
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
          <p className="text-sm text-gray-500 mb-3">Factura</p>
          <Link
            href={`/invoices/${invoiceId}`}
            className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Ver factura →
          </Link>
        </div>
      ) : canInvoice ? (
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4">
          <p className="text-sm text-gray-500 mb-3">Factura</p>
          <GenerateInvoiceButton orderId={order.id} />
        </div>
      ) : null}
    </div>
  );
}
