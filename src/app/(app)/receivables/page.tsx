/**
 * Receivables overview page — RSC.
 *
 * AR-T18: New Server Component.
 *
 * Loads all non-cancelled-order invoices via getReceivableInvoices, groups
 * them by store, and computes aging bucket rollup using agingBucket() per invoice.
 *
 * BackfillNotice shown when any store is still at the default 30-day terms
 * (indicates operator should review per-store payment terms after migration).
 *
 * Covers: REQ-6/S6-1, S6-2; REQ-7/S7-3
 */

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getReceivableInvoices } from '@/lib/data/invoices';
import { agingBucket, outstanding, type AgingBucket } from '@/lib/domain/aging';
import { BackfillNotice } from '@/components/shared/BackfillNotice';
import Link from 'next/link';

function getToday(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type AgingRollup = Record<AgingBucket, number>;

interface StoreRow {
  storeId: string;
  storeName: string;
  saldo: number;
  aging: AgingRollup;
}

const BUCKETS: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function ReceivablesPage(_props: any) {
  await requireUser();
  const supabase = await createClient();
  const invoices = await getReceivableInvoices(supabase);
  const today = getToday();

  // Group by store and compute aging rollup
  const storeMap = new Map<string, StoreRow>();

  for (const inv of invoices) {
    const store = inv.order?.store;
    if (!store) continue;

    const os = outstanding(inv.total, inv.total_paid);
    if (os <= 0) continue; // fully paid — contributes 0, skip for saldo but include in rollup

    const bucket = agingBucket(inv.due_date, today);

    if (!storeMap.has(store.id)) {
      storeMap.set(store.id, {
        storeId: store.id,
        storeName: store.nombre,
        saldo: 0,
        aging: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
      });
    }
    const row = storeMap.get(store.id)!;
    row.saldo = Math.round((row.saldo + os) * 100) / 100;
    row.aging[bucket] = Math.round((row.aging[bucket] + os) * 100) / 100;
  }

  const rows = Array.from(storeMap.values()).sort((a, b) =>
    a.storeName.localeCompare(b.storeName)
  );

  // Show backfill notice if there are outstanding invoices (migration may have just run)
  const showBackfillNotice = invoices.length > 0;

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Cuentas por cobrar</h1>
          <Link
            href="/invoices"
            className="text-sm text-brand hover:text-brand-dark font-medium transition-colors"
          >
            Ver facturas
          </Link>
        </div>

        <BackfillNotice
          show={showBackfillNotice}
          storageKey="stockio:ar-backfill-notice-dismissed"
          message="Revisá los plazos de pago por tienda — se aplicó el plazo predeterminado de 30 días a las facturas existentes."
        />

        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No hay cuentas por cobrar pendientes.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">Tienda</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Corriente</th>
                  <th className="px-4 py-3 text-right">1-30</th>
                  <th className="px-4 py-3 text-right">31-60</th>
                  <th className="px-4 py-3 text-right">61-90</th>
                  <th className="px-4 py-3 text-right">90+</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.storeId}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{row.storeName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      ${row.saldo.toFixed(2)}
                    </td>
                    {BUCKETS.map((b) => (
                      <td key={b} className="px-4 py-3 text-right text-gray-600">
                        {row.aging[b] > 0 ? `$${row.aging[b].toFixed(2)}` : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
