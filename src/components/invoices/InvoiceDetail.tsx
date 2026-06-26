/**
 * InvoiceDetail — RSC presentational component (comprobante).
 *
 * Displays full invoice information:
 *  - Numero (prominent header), store nombre, fecha_emision, estado_pago badge
 *  - Frozen line items with product nombre × cantidad × precio_unitario = subtotal
 *  - Authoritative invoice.total
 *  - Payment toggle form (setPaymentStatusAction) to flip pendiente ↔ pagado
 *
 * Mobile-first layout, consistent with OrderDetail.
 */

import type { InvoiceDetail as InvoiceDetailType } from '@/lib/data/invoices';
import { setPaymentStatusAction } from '@/app/(app)/invoices/actions';

interface Props {
  invoice: InvoiceDetailType;
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  },
  pagado: {
    label: 'Paid',
    className: 'bg-green-100 text-green-700 border border-green-200',
  },
};

const UNPAID_BADGE = {
  label: 'Unpaid',
  className: 'bg-gray-100 text-gray-500 border border-gray-200',
};

export function InvoiceDetail({ invoice }: Props) {
  const badge = invoice.estado_pago
    ? (ESTADO_BADGE[invoice.estado_pago] ?? {
        label: invoice.estado_pago,
        className: 'bg-gray-100 text-gray-500 border border-gray-200',
      })
    : UNPAID_BADGE;

  // Payment toggle: if currently pagado → offer pendiente, else offer pagado
  const nextEstado = invoice.estado_pago === 'pagado' ? 'pendiente' : 'pagado';
  const toggleLabel =
    invoice.estado_pago === 'pagado' ? 'Mark as pending' : 'Mark as paid';

  const items = invoice.order?.items ?? [];

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 text-xl">
              Invoice #{invoice.numero}
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              {invoice.order?.store?.nombre ?? 'Unknown store'}
            </p>
            <p className="text-sm text-gray-400 mt-0.5">{invoice.fecha_emision}</p>
          </div>
          <span
            role="status"
            className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* ── Line items ───────────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Items
        </h3>

        <ul className="space-y-0 divide-y divide-gray-50" aria-label="Invoice items">
          {items.map((item) => (
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

        {/* Authoritative invoice total */}
        <div className="flex justify-end pt-3 border-t border-gray-100">
          <p className="text-sm">
            <span className="text-gray-500">Total: </span>
            <span className="font-semibold text-gray-900 text-base">
              ${invoice.total.toFixed(2)}
            </span>
          </p>
        </div>
      </div>

      {/* ── Payment toggle ───────────────────────────────────────── */}
      <div>
        <form action={setPaymentStatusAction}>
          <input type="hidden" name="id" value={invoice.id} />
          <input type="hidden" name="estado" value={nextEstado} />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 transition-colors min-h-[44px]"
          >
            {toggleLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
