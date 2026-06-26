import Link from 'next/link';
import { requireUser } from '@/lib/auth/get-user';
import { NavSignOutButton } from '@/components/NavSignOutButton';

/**
 * Protected shell layout for all (app) routes.
 * Calls requireUser() which redirects unauthenticated visitors to /login.
 * Belt-and-suspenders with the middleware matcher.
 *
 * Top navigation: bold brand-orange bar with white wordmark and nav links.
 * Sign-out button (type="button", not type="submit") lives on the far right
 * so that E2E [type=submit] selectors still target only content form buttons.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="min-h-screen bg-cream">
      <nav className="bg-brand shadow-md">
        <div className="max-w-2xl mx-auto px-4 flex items-center gap-5 h-14">
          {/* Wordmark */}
          <span className="font-bold text-white text-base tracking-tight shrink-0">
            🛒 Stockio
          </span>

          {/* Nav links */}
          <Link
            href="/dashboard"
            className="text-sm text-white/80 hover:text-white transition-colors"
          >
            Inicio
          </Link>
          <Link
            href="/products"
            className="text-sm text-white/80 hover:text-white transition-colors"
          >
            Productos
          </Link>
          <Link
            href="/stores"
            className="text-sm text-white/80 hover:text-white transition-colors"
          >
            Tiendas
          </Link>
          <Link
            href="/orders"
            className="text-sm text-white/80 hover:text-white transition-colors"
          >
            Pedidos
          </Link>
          <Link
            href="/invoices"
            className="text-sm text-white/80 hover:text-white transition-colors"
          >
            Facturas
          </Link>

          {/* Sign-out pushed to the right — type="button" to avoid [type=submit] collision */}
          <div className="ml-auto">
            <NavSignOutButton />
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
