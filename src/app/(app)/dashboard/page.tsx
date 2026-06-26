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
 *
 * The signOut form on this page keeps [type=submit] available for E2E auth tests
 * (auth.spec.ts signs out via that selector from the dashboard).
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { lowStockProducts, recentOrders, periodOrders, period } =
    await getDashboardData(supabase);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Inicio</h1>
          <form action={signOut}>
            <button
              type="submit"
              className="btn-secondary text-sm px-3 py-2"
            >
              Cerrar sesión
            </button>
          </form>
        </div>

        {/* User chip */}
        <div className="rounded-xl bg-brand-50 border border-orange-200 p-4">
          <p className="text-xs text-brand font-medium">Conectado como</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">{user.email}</p>
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
