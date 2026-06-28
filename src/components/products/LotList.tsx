'use client';

/**
 * LotList — displays inventory lots for a product with expiry badges.
 *
 * Props:
 *   lots       — array of Lot (from data/lots.ts)
 *   today      — ISO date string (YYYY-MM-DD); injected for testability
 *   alertDays  — product.expiry_alert_days; controls "expiring soon" threshold
 *
 * Badge states (REQ-6):
 *   "Vencido"    — expiry_date < today
 *   "Por vencer" — today <= expiry_date <= today + alertDays
 *   "Vigente"    — expiry_date > today + alertDays
 *   "Sin fecha"  — expiry_date is null
 *
 * Zero-quantity lots are rendered (audit trail) — quantity 0 shown, not hidden.
 * NULL-expiry lots never show expired or expiring-soon (S6-3).
 */

import { expiryStatus } from '@/lib/domain/expiry';
import type { Lot } from '@/lib/data/lots';

interface Props {
  lots: Lot[];
  today: string;
  alertDays: number;
}

type BadgeVariant = 'expired' | 'expiring_soon' | 'ok' | 'none';

const BADGE_CONFIG: Record<
  BadgeVariant,
  { label: string; className: string }
> = {
  expired: {
    label: 'Vencido',
    className: 'bg-red-100 text-red-700 border border-red-200',
  },
  expiring_soon: {
    label: 'Por vencer',
    className: 'bg-amber-100 text-amber-700 border border-amber-200',
  },
  ok: {
    label: 'Vigente',
    className: 'bg-green-100 text-green-700 border border-green-200',
  },
  none: {
    label: 'Sin fecha',
    className: 'bg-gray-100 text-gray-500 border border-gray-200',
  },
};

function ExpiryBadge({
  expiryDate,
  today,
  alertDays,
}: {
  expiryDate: string | null;
  today: string;
  alertDays: number;
}) {
  const status = expiryStatus(expiryDate, alertDays, today);
  const { label, className } = BADGE_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

export function LotList({ lots, today, alertDays }: Props) {
  if (lots.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        No hay lotes registrados para este producto.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-500"
            >
              Tipo
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right font-medium text-gray-500"
            >
              Cantidad
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-500"
            >
              Fecha de recepción
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-500"
            >
              Fecha de vencimiento
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-500"
            >
              Estado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {lots.map((lot) => (
            <tr key={lot.id} className={lot.quantity === 0 ? 'opacity-40' : ''}>
              <td className="px-4 py-3 capitalize text-gray-700">
                {lot.lot_type}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                {lot.quantity}
              </td>
              <td className="px-4 py-3 text-gray-600">{lot.received_date}</td>
              <td className="px-4 py-3 text-gray-600">
                {lot.expiry_date ?? '—'}
              </td>
              <td className="px-4 py-3">
                <ExpiryBadge
                  expiryDate={lot.expiry_date}
                  today={today}
                  alertDays={alertDays}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
