/**
 * ExpiringSoonWidget — RSC presentational component.
 *
 * Displays a summary of lots that are expired or expiring soon.
 * Counts and nearExpiry list are pre-computed by getExpiringSoonSummary (data/lots.ts).
 *
 * NULL-expiry lots and zero-quantity lots are excluded by the data layer (REQ-6 S6-2, S6-3).
 *
 * Colored header: amber to signal attention without danger urgency.
 */

import Link from 'next/link';
import type { ExpiringSoonSummary } from '@/lib/data/lots';

interface Props {
  summary: ExpiringSoonSummary;
}

export function ExpiringSoonWidget({ summary }: Props) {
  const { expiredCount, expiringSoonCount, nearExpiry } = summary;
  const hasAlerts = expiredCount > 0 || expiringSoonCount > 0;

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      {/* Amber header */}
      <div className="bg-warning px-6 py-4">
        <h2 className="font-bold text-white">Lotes por vencer</h2>
      </div>

      <div className="p-6 space-y-4">
        {/* Count badges */}
        <div className="flex gap-4">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <span className="text-lg font-bold text-red-700">{expiredCount}</span>
              <span className="text-xs text-red-500">vencidos</span>
            </div>
          )}
          {expiringSoonCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
              <span className="text-lg font-bold text-amber-700">{expiringSoonCount}</span>
              <span className="text-xs text-amber-500">por vencer</span>
            </div>
          )}
        </div>

        {/* Near-expiry list or empty message */}
        {!hasAlerts ? (
          <p className="text-sm text-gray-500">Sin alertas de vencimiento</p>
        ) : (
          <ul className="space-y-2">
            {nearExpiry.map((lot) => (
              <li key={lot.id}>
                <Link
                  href={`/products/${lot.product_id}`}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-amber-50 transition-colors"
                >
                  <span className="font-medium text-gray-900 truncate">
                    {lot.product?.nombre ?? 'Producto'}
                  </span>
                  {lot.expiry_date && (
                    <span className="ml-2 text-xs text-amber-700 whitespace-nowrap font-medium">
                      {lot.expiry_date}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
