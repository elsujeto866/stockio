import Link from 'next/link';
import { requireUser } from '@/lib/auth/get-user';

/**
 * Protected shell layout for all (app) routes.
 * Calls requireUser() which redirects unauthenticated visitors to /login.
 * Belt-and-suspenders with the middleware matcher.
 *
 * Includes a persistent top navigation bar with links to:
 *  - Dashboard (/dashboard)
 *  - Products (/products)
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 flex items-center gap-6 h-14">
          <span className="font-semibold text-gray-900 text-sm tracking-tight">
            Stockio
          </span>
          <Link
            href="/dashboard"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/products"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Products
          </Link>
          <Link
            href="/stores"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Stores
          </Link>
          <Link
            href="/orders"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Orders
          </Link>
          <Link
            href="/invoices"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Invoices
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
