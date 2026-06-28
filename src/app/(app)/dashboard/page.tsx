import { requireUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/data/dashboard';
import { LowStockWidget } from '@/components/dashboard/LowStockWidget';
import { RecentOrdersWidget } from '@/components/dashboard/RecentOrdersWidget';
import { PeriodTotalsWidget } from '@/components/dashboard/PeriodTotalsWidget';

/**
 * Dashboard — protected RSC.
 *
 * Fetches low-stock products, recent orders, and current-month totals in a
 * single parallel round-trip, then passes slices to each widget as props.
 *
 * The signOut form on this page keeps [type=submit] available for E2E auth tests
 * (auth.spec.ts signs out via that selector from the dashboard).
 */
export default async function DashboardPage() {
  await requireUser();
  const supabase = await createClient();
  const { lowStockProducts, recentOrders, periodOrders, period } =
    await getDashboardData(supabase);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Inicio</h1>

        <PeriodTotalsWidget
          orders={periodOrders}
          lowStockCount={lowStockProducts.length}
          period={period}
        />

        <LowStockWidget products={lowStockProducts} />

        <RecentOrdersWidget orders={recentOrders} />
      </div>
    </main>
  );
}
