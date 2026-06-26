/**
 * InvoiceCard — RSC presentational component.
 *
 * Displays a single invoice summary card with:
 *  - Invoice numero (formatted as #N)
 *  - Store nombre (from the joined order.store relation)
 *  - fecha_emision
 *  - Estado_pago badge (Pending / Paid / Unpaid)
 *  - Total formatted as currency
 *
 * The entire card is wrapped in a Link to the invoice detail page.
 * Mobile-first layout, consistent with OrderCard / StoreCard.
 */

import Link from 'next/link';
import type { InvoiceListItem } from '@/lib/data/invoices';

interface Props {
  invoice: InvoiceListItem;
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

export function InvoiceCard({ invoice }: Props) {
  const badge = invoice.estado_pago
    ? (ESTADO_BADGE[invoice.estado_pago] ?? {
        label: invoice.estado_pago,
        className: 'bg-gray-100 text-gray-500 border border-gray-200',
      })
    : UNPAID_BADGE;

  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="block rounded-xl bg-white shadow-sm border border-gray-100 p-4 space-y-2 hover:border-blue-200 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">
            Invoice #{invoice.numero}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {invoice.order?.store?.nombre ?? 'Unknown store'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{invoice.fecha_emision}</p>
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
          ${invoice.total.toFixed(2)}
        </span>
      </div>
    </Link>
  );
}
