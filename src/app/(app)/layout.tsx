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
        <div className="max-w-2xl mx-auto px-4">
          {/* Top row: wordmark + sign-out, always visible on every width */}
          <div className="flex items-center justify-between h-14">
            <span className="font-bold text-white text-lg tracking-tight">
              🛒 Stockio
            </span>
            {/* type="button" avoids [type=submit] collision with content forms */}
            <NavSignOutButton />
          </div>

          {/* Nav links: wrap instead of overflowing on narrow (mobile) screens */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-2.5">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-white/85 hover:text-white transition-colors"
            >
              Inicio
            </Link>
            <Link
              href="/products"
              className="text-sm font-medium text-white/85 hover:text-white transition-colors"
            >
              Productos
            </Link>
            <Link
              href="/stores"
              className="text-sm font-medium text-white/85 hover:text-white transition-colors"
            >
              Tiendas
            </Link>
            <Link
              href="/orders"
              className="text-sm font-medium text-white/85 hover:text-white transition-colors"
            >
              Pedidos
            </Link>
            <Link
              href="/suppliers"
              className="text-sm font-medium text-white/85 hover:text-white transition-colors"
            >
              Proveedores
            </Link>
            <Link
              href="/invoices"
              className="text-sm font-medium text-white/85 hover:text-white transition-colors"
            >
              Facturas
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
