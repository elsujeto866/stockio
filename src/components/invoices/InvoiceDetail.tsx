/**
 * InvoiceDetail — RSC presentational component (comprobante).
 *
 * Displays full invoice information:
 *  - Numero (prominent header), store nombre, fecha_emision, estado_pago badge
 *  - (WU6) Emisor block: razon_social, RUC, formatted secuencial — only when emisor_ruc present
 *  - (WU6) Buyer block: tipo label, numero_identificacion, razon_social — only when comprador_tipo present
 *  - Frozen line items with product nombre × cantidad × precio_unitario = subtotal
 *  - (WU6) IVA breakdown: Subtotal base | IVA 15% | Total — replaces bare total when present
 *  - Bare Total — shown only for pre-SRI invoices (subtotal_base_imponible == null)
 *
 * All SRI blocks are independently NULL-guarded (REQ-7d/7e):
 *   - Pre-SRI invoices render exactly as before — no crash, no SRI blocks.
 *   - Partial snapshots (e.g., emisor present but no buyer) show only the present blocks.
 *
 * Payment recording is handled by the AbonoForm on the invoice page.
 * Direct payment-status toggle was retired in AR (WU6/AR-T20).
 *
 * Mobile-first layout, consistent with OrderDetail.
 */

import type { InvoiceDetail as InvoiceDetailType } from '@/lib/data/invoices';
import { formatCurrency, formatDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// Tipo identificación → human-readable label (REQ-7b)
// ---------------------------------------------------------------------------
const TIPO_LABEL: Record<string, string> = {
  '04': 'RUC',
  '05': 'Cédula',
  '06': 'Pasaporte',
  '07': 'Consumidor Final',
  '08': 'Exterior',
};

interface Props {
  invoice: InvoiceDetailType;
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

export function InvoiceDetail({ invoice }: Props) {
  const badge = invoice.estado_pago
    ? (ESTADO_BADGE[invoice.estado_pago] ?? {
        label: invoice.estado_pago,
        className: 'bg-gray-200 text-gray-700',
      })
    : UNPAID_BADGE;

  const items = invoice.order?.items ?? [];

  // Formatted secuencial: estab-pto_emi-numero_9digits (REQ-7a)
  const secuencial =
    invoice.emisor_ruc != null
      ? `${invoice.emisor_estab}-${invoice.emisor_pto_emi}-${String(invoice.numero).padStart(9, '0')}`
      : null;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-grape" />
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 text-xl">
                Factura #{invoice.numero}
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {invoice.order?.store?.nombre ?? 'Tienda desconocida'}
              </p>
              <p className="text-sm text-gray-400 mt-0.5">{formatDate(invoice.fecha_emision)}</p>
            </div>
            <span
              role="status"
              className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── Emisor block (WU6) ─────────────────────────────────── */}
      {invoice.emisor_ruc != null && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-brand" />
          <div className="p-4 space-y-1">
            <h3 className="text-sm font-semibold text-brand uppercase tracking-wide mb-2">
              Emisor
            </h3>
            <p className="text-sm font-semibold text-gray-900">{invoice.emisor_razon_social}</p>
            <p className="text-sm text-gray-600">{invoice.emisor_ruc}</p>
            {secuencial && (
              <p className="text-sm text-gray-500 font-mono">{secuencial}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Buyer block (WU6) ───────────────────────────────────── */}
      {invoice.comprador_tipo_identificacion != null && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-warning" />
          <div className="p-4 space-y-1">
            <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Comprador
            </h3>
            <p className="text-xs text-gray-500 uppercase">
              {TIPO_LABEL[invoice.comprador_tipo_identificacion] ?? invoice.comprador_tipo_identificacion}
            </p>
            {invoice.comprador_numero_identificacion && (
              <p className="text-sm text-gray-700 font-mono">{invoice.comprador_numero_identificacion}</p>
            )}
            {invoice.comprador_razon_social && (
              <p className="text-sm font-semibold text-gray-900">{invoice.comprador_razon_social}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Line items ───────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-info" />
        <div className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-info uppercase tracking-wide">
            Artículos
          </h3>

          <ul className="space-y-0 divide-y divide-gray-50" aria-label="Artículos de la factura">
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
                  <span className="text-gray-600">{formatCurrency(item.precio_unitario)}</span>
                  <span className="font-semibold text-info min-w-[64px] text-right">
                    {formatCurrency(item.subtotal)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* IVA breakdown (WU6) — shown only for SRI invoices; replaces bare total */}
          {invoice.subtotal_base_imponible != null ? (
            <div className="pt-3 border-t border-gray-100 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal base imponible</span>
                <span className="text-gray-700">{formatCurrency(invoice.subtotal_base_imponible)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">IVA 15%</span>
                <span className="text-gray-700">{formatCurrency(invoice.valor_iva ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-gray-100 pt-1">
                <span className="text-gray-700">Total</span>
                <span className="text-info text-lg">{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          ) : (
            /* Bare total for pre-SRI invoices */
            <div className="flex justify-end pt-3 border-t border-gray-100">
              <p className="text-sm">
                <span className="text-gray-500">Total: </span>
                <span className="font-bold text-info text-lg">
                  {formatCurrency(invoice.total)}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
