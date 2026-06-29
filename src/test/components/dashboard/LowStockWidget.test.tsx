/**
 * Unit tests for LowStockWidget.
 *
 * Verifies:
 *  - count badge shows the number of low-stock products
 *  - each product name is rendered
 *  - each product links to /products
 *  - empty state renders when no low-stock products
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock Next.js Link to a plain anchor in jsdom.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { LowStockWidget } from '@/components/dashboard/LowStockWidget';
import type { Product } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeProduct(id: string, nombre: string): Product {
  return {
    id,
    tenant_id: 't1',
    nombre,
    sku: null,
    categoria: null,
    precio_unitario: 10,
    stock_actual: 2,
    stock_minimo: 10,
    unidad_medida: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    units_per_package: null,
    precio_paca: null,
    cost_price: null,
    shelf_life_days: null,
    expiry_alert_days: 30,
  image_path: null,
  };
}

const sampleProducts = [
  makeProduct('p1', 'Low Widget A'),
  makeProduct('p2', 'Low Widget B'),
];

describe('LowStockWidget', () => {
  it('renders the count of low-stock products', () => {
    render(<LowStockWidget products={sampleProducts} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders each low-stock product name', () => {
    render(<LowStockWidget products={sampleProducts} />);
    expect(screen.getByText('Low Widget A')).toBeInTheDocument();
    expect(screen.getByText('Low Widget B')).toBeInTheDocument();
  });

  it('each product row links to /products', () => {
    render(<LowStockWidget products={sampleProducts} />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', '/products');
    });
  });

  it('renders the empty state when no products are low stock', () => {
    render(<LowStockWidget products={[]} />);
    expect(screen.getByText(/Todos los productos tienen stock suficiente/i)).toBeInTheDocument();
  });

  it('does NOT render the empty state when products are present', () => {
    render(<LowStockWidget products={sampleProducts} />);
    expect(screen.queryByText(/All products are well stocked/i)).not.toBeInTheDocument();
  });
});
