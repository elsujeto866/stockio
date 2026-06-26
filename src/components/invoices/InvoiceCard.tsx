/**
 * InvoiceCard — RSC presentational component.
 *
 * Displays a single invoice summary card with:
 *  - Invoice numero (formatted as #N)
 *  - Store nombre (from the joined order.store relation)
 *  - fecha_emision
 *  - Estado_pago badge (vibrant color pills)
 *  - Total formatted as currency
 *
 * The entire card is wrapped in a Link to the invoice detail page.
 * Mobile-first layout, consistent with OrderCard / StoreCard.
 */

import Link from 'next/link';
import type { InvoiceListItem } from '@/lib/data/invoices';
import { formatCurrency, formatDate } from '@/lib/format';

interface Props {
  invoice: InvoiceListItem;
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: {
    label: 'Pendiente',
    className: 'bg-warning text-amber-900',
  },
  pagado: {
    label: 'Pagado',
    className: 'bg-success text-white',
  },
};

const UNPAID_BADGE = {
  label: 'Sin pagar',
  className: 'bg-gray-200 text-gray-600',
};

export function InvoiceCard({ invoice }: Props) {
  const badge = invoice.estado_pago
    ? (ESTADO_BADGE[invoice.estado_pago] ?? {
        label: invoice.estado_pago,
        className: 'bg-gray-200 text-gray-700',
      })
    : UNPAID_BADGE;

  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="block rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden hover:border-brand transition-colors"
    >
      <div className="h-1 bg-grape" />
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 truncate">
              Factura #{invoice.numero}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {invoice.order?.store?.nombre ?? 'Tienda desconocida'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(invoice.fecha_emision)}</p>
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
            {formatCurrency(invoice.total)}
          </span>
        </div>
      </div>
    </Link>
  );
}
