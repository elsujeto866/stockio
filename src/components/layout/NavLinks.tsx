'use client';

/**
 * NavLinks — Client island for the app shell navigation.
 *
 * Uses usePathname() to highlight the active route.
 * Active match: exact href OR pathname starts with href + '/'.
 *
 * Kept in its own file so AppLayout remains a Server Component.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/products', label: 'Productos' },
  { href: '/stores', label: 'Tiendas' },
  { href: '/orders', label: 'Pedidos' },
  { href: '/suppliers', label: 'Proveedores' },
  { href: '/purchases', label: 'Compras' },
  { href: '/invoices', label: 'Facturas' },
  { href: '/receivables', label: 'Por cobrar' },
];

const inactiveClass = 'text-sm font-medium text-white/85 hover:text-white transition-colors';
const activeClass = 'text-sm font-medium text-white underline underline-offset-4 transition-colors';

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {NAV_LINKS.map(({ href, label }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={isActive ? activeClass : inactiveClass}
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
