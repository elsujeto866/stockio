'use client';

/**
 * Sidebar — Client island for the app shell navigation.
 *
 * Desktop: collapsible rail (full labels ↔ icon-only).
 * Mobile: off-canvas overlay triggered by the hamburger in AppShell's top bar.
 *
 * Collapse state persists to localStorage under key "sidebar-collapsed".
 * The lazy useState init is SSR-safe (typeof window guard).
 * localStorage writes happen in the toggle handler — NOT in a setState-in-effect
 * (avoids the React Compiler hydration issue that forced the BackfillNotice split).
 *
 * Active matching: pathname === href OR pathname.startsWith(href + '/')
 * — same rule as the former NavLinks component so muscle memory is preserved.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// -----------------------------------------------------------------------
// Navigation data
// -----------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: 'GENERAL',
    items: [
      { href: '/dashboard', label: 'Inicio', icon: '🏠' },
      { href: '/products', label: 'Productos', icon: '📦' },
    ],
  },
  {
    title: 'COMPRAS',
    items: [
      { href: '/suppliers', label: 'Proveedores', icon: '🚚' },
      { href: '/purchases', label: 'Compras', icon: '🛒' },
    ],
  },
  {
    title: 'VENTAS',
    items: [
      { href: '/stores', label: 'Tiendas', icon: '🏪' },
      { href: '/orders', label: 'Pedidos', icon: '📋' },
      { href: '/invoices', label: 'Facturas', icon: '🧾' },
      { href: '/receivables', label: 'Por cobrar', icon: '💰' },
    ],
  },
];

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

interface SidebarProps {
  /** True when the mobile overlay is open (controlled by AppShell). */
  mobileOpen: boolean;
  /** Called when the sidebar should close (Escape, backdrop, link click). */
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  /**
   * Collapsed (rail) state — lazy init reads localStorage on the client only.
   * Falls back to false (expanded) during SSR.
   */
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebar-collapsed') === '1';
  });

  /** Escape key closes the mobile overlay. No-op when overlay is closed. */
  useEffect(() => {
    if (!mobileOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onClose]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // Write directly in the event handler — not in a useEffect
    localStorage.setItem('sidebar-collapsed', next ? '1' : '0');
  }

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Mobile backdrop — rendered only when overlay is open             */}
      {/* ---------------------------------------------------------------- */}
      {mobileOpen && (
        <div
          data-testid="sidebar-backdrop"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Sidebar panel                                                     */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className={[
          // Layout & positioning
          'flex flex-col bg-white border-r border-gray-200',
          'transition-all duration-200',
          // Desktop: sticky rail in the flex row
          'md:relative md:translate-x-0 md:h-screen md:sticky md:top-0',
          // Mobile: fixed overlay, slides in/out
          'fixed inset-y-0 left-0 z-50 md:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          // Width: full labels vs icon-only rail
          collapsed ? 'w-16' : 'w-64',
        ].join(' ')}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Collapse toggle                                                   */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-center justify-end px-2 py-2 border-b border-gray-100">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            aria-expanded={!collapsed}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              {collapsed ? (
                /* chevron-right */
                <polyline points="9 18 15 12 9 6" />
              ) : (
                /* chevron-left */
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Navigation                                                        */}
        {/* ---------------------------------------------------------------- */}
        <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto py-3">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-2">
              {/* Section heading — hidden in rail mode */}
              {!collapsed ? (
                <p className="px-4 pb-1 text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
                  {section.title}
                </p>
              ) : (
                <hr className="mx-2 my-1 border-gray-200" aria-hidden="true" />
              )}

              {/* Nav items */}
              {section.items.map(({ href, label, icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    /* In rail mode the label text is hidden, so provide it
                       via aria-label for screen-reader and title for hover. */
                    aria-label={collapsed ? label : undefined}
                    title={collapsed ? label : undefined}
                    className={[
                      'flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors',
                      collapsed ? 'justify-center' : '',
                      active
                        ? 'bg-brand-50 text-brand'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                    ].join(' ')}
                  >
                    <span aria-hidden="true">{icon}</span>
                    {!collapsed && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
