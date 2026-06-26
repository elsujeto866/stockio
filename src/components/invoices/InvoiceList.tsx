/**
 * InvoiceList — RSC presentational component.
 *
 * Maps an array of invoices to InvoiceCard components.
 * Shows an empty-state prompt when no invoices exist.
 */

import type { InvoiceListItem } from '@/lib/data/invoices';
import { InvoiceCard } from './InvoiceCard';

interface Props {
  invoices: InvoiceListItem[];
}

export function InvoiceList({ invoices }: Props) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-3">
        <p className="text-3xl">🧾</p>
        <p className="text-gray-500 text-sm">No hay facturas todavía</p>
        <p className="text-gray-400 text-xs">
          Genera una factura desde la página de detalle del pedido.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Lista de facturas">
      {invoices.map((invoice) => (
        <li key={invoice.id}>
          <InvoiceCard invoice={invoice} />
        </li>
      ))}
    </ul>
  );
}
