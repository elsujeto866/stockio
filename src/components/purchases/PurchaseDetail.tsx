/**
 * PurchaseDetail — RSC presentational component.
 *
 * Displays full purchase information:
 *  - Supplier nombre + fecha + estado badge (recibido=green / cancelado=gray)
 *  - Optional notas
 *  - Line items table: product nombre, costo_unitario, cantidad, subtotal
 *  - Authoritative purchase.total (from DB)
 *  - CancelPurchaseButton (client) — ONLY when estado === 'recibido'
 *
 * Mirrors OrderDetail but for the purchases domain (no invoice section).
 */

import type { PurchaseDetail as PurchaseDetailType } from '@/lib/data/purchases';
import { CancelPurchaseButton } from '@/components/purchases/CancelPurchaseButton';
import { formatCurrency, formatDate } from '@/lib/format';

interface Props {
  purchase: PurchaseDetailType;
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

export function PurchaseDetail({ purchase }: Props) {
  const badge = ESTADO_BADGE[purchase.estado] ?? {
    label: purchase.estado,
    className: 'bg-gray-200 text-gray-700',
  };
  const isReceived = purchase.estado === 'recibido';

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-brand" />
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 text-lg truncate">
                {purchase.supplier?.nombre ?? 'Proveedor desconocido'}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{formatDate(purchase.fecha)}</p>
            </div>
            <span
              role="status"
              className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>

          {purchase.notas && (
            <p className="text-sm text-gray-600 bg-brand-50 rounded-lg px-3 py-2">
              {purchase.notas}
            </p>
          )}
        </div>
      </div>

      {/* ── Line items ───────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-info" />
        <div className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-info uppercase tracking-wide">
            Artículos
          </h2>

          <ul
            className="space-y-0 divide-y divide-gray-50"
            aria-label="Artículos de la compra"
          >
            {purchase.items.map((item) => (
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
                  <span className="text-gray-600">{formatCurrency(item.costo_unitario)}</span>
                  <span className="font-semibold text-info min-w-[64px] text-right">
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
              <span className="font-bold text-info text-lg">
                {purchase.total !== null ? formatCurrency(purchase.total) : '—'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Cancel action — only when estado === 'recibido' ─────── */}
      {isReceived && (
        <CancelPurchaseButton purchaseId={purchase.id} />
      )}
    </div>
  );
}
