import { requireUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/data/dashboard';
import { getExpiringSoonSummary } from '@/lib/data/lots';
import { LowStockWidget } from '@/components/dashboard/LowStockWidget';
import { RecentOrdersWidget } from '@/components/dashboard/RecentOrdersWidget';
import { PeriodTotalsWidget } from '@/components/dashboard/PeriodTotalsWidget';
import { ExpiringSoonWidget } from '@/components/dashboard/ExpiringSoonWidget';
import { BackfillNotice } from '@/components/shared/BackfillNotice';

/**
 * Dashboard — protected RSC.
 *
 * Fetches low-stock products, recent orders, current-month totals, and
 * expiry-soon summary in a single parallel round-trip.
 *
 * REQ-6: ExpiringSoonWidget shows expired/expiring-soon lot counts.
 * REQ-8: BackfillNotice prompts operator to fill in real expiry dates
 *        for backfilled lots (adjustment lots with null expiry_date).
 *
 * The signOut form on this page keeps [type=submit] available for E2E auth tests
 * (auth.spec.ts signs out via that selector from the dashboard).
 */
export default async function DashboardPage() {
  await requireUser();
  const supabase = await createClient();

  // Parallel fetch — lots query is lightweight (SELECT-only, no joins in main path)
  const [
    { lowStockProducts, recentOrders, periodOrders, period },
    expirySummary,
  ] = await Promise.all([
    getDashboardData(supabase),
    getExpiringSoonSummary(supabase).catch(() => ({
      expiredCount: 0,
      expiringSoonCount: 0,
      nearExpiry: [],
    })),
  ]);

  // Show backfill notice only when the lots table is available (migration applied)
  // and there are active adjustment lots with null expiry (legacy backfill rows).
  const { data: backfillRows } = await supabase
    .from('lots')
    .select('id', { count: 'exact', head: true })
    .eq('lot_type', 'adjustment')
    .is('expiry_date', null)
    .gt('quantity', 0)
    .limit(1);

  const showBackfillNotice = Array.isArray(backfillRows)
    ? backfillRows.length > 0
    : false;

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Inicio</h1>

        <BackfillNotice show={showBackfillNotice} />

        <PeriodTotalsWidget
          orders={periodOrders}
          lowStockCount={lowStockProducts.length}
          period={period}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LowStockWidget products={lowStockProducts} />
          <ExpiringSoonWidget summary={expirySummary} />
        </div>

        <RecentOrdersWidget orders={recentOrders} />
      </div>
    </main>
  );
}
