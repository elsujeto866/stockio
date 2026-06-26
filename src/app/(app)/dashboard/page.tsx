import { requireUser } from '@/lib/auth/get-user';
import { signOut } from '@/app/(auth)/login/actions';
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
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { lowStockProducts, recentOrders, periodOrders, period } =
    await getDashboardData(supabase);

  return (
    <main className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Signed in as</p>
          <p className="mt-0.5 text-sm font-medium text-gray-900">{user.email}</p>
        </div>

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
