import { requireUser } from '@/lib/auth/get-user';
import { signOut } from '@/app/(auth)/login/actions';

/**
 * Dashboard — protected RSC placeholder.
 * Proves that auth + middleware work end-to-end.
 * Data queries (profiles, products, etc.) are added in WU3+ once the schema is in place.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="min-h-screen p-8 bg-gray-50">
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

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Signed in as</p>
          <p className="mt-1 font-medium text-gray-900">{user.email}</p>
        </div>

        <p className="text-xs text-gray-400">
          Data tables (products, orders, stores) are available after WU3 schema migration.
        </p>
      </div>
    </main>
  );
}
