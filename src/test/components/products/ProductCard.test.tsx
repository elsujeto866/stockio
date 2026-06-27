/**
 * Unit tests for ProductCard.
 *
 * Verifies:
 *  - nombre, sku, and stock values are visible
 *  - LowStockBadge appears when stock_actual < stock_minimo (R6)
 *  - LowStockBadge is absent when stock_actual >= stock_minimo
 *  - Edit and Adjust stock links are present with correct hrefs
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

// Mock Server Action import so the RSC component can load in jsdom.
vi.mock('@/app/(app)/products/actions', () => ({
  deleteProductAction: vi.fn(),
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
  adjustStockAction: vi.fn(),
}));

import { ProductCard } from '@/components/products/ProductCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseProduct = {
  id: 'prod-1',
  tenant_id: 't-1',
  nombre: 'Aceite de Oliva',
  sku: 'OL-001',
  categoria: 'Alimentos',
  precio_unitario: 12.5,
  stock_actual: 100,
  stock_minimo: 10,
  unidad_medida: 'litro',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  units_per_package: null,
  precio_paca: null,
};

describe('ProductCard', () => {
  it('displays the product name', () => {
    render(<ProductCard product={baseProduct} />);
    expect(screen.getByText('Aceite de Oliva')).toBeInTheDocument();
  });

  it('displays the SKU', () => {
    render(<ProductCard product={baseProduct} />);
    expect(screen.getByText(/OL-001/)).toBeInTheDocument();
  });

  it('displays the current stock value', () => {
    render(<ProductCard product={baseProduct} />);
    expect(screen.getByText(/100/)).toBeInTheDocument();
  });

  it('shows LowStockBadge when stock_actual < stock_minimo (R6)', () => {
    render(
      <ProductCard product={{ ...baseProduct, stock_actual: 5, stock_minimo: 10 }} />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does NOT show LowStockBadge when stock_actual equals stock_minimo', () => {
    render(
      <ProductCard product={{ ...baseProduct, stock_actual: 10, stock_minimo: 10 }} />
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does NOT show LowStockBadge when stock_actual > stock_minimo', () => {
    render(<ProductCard product={baseProduct} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('contains an edit link pointing to /products/[id]/edit', () => {
    render(<ProductCard product={baseProduct} />);
    const editLink = screen.getByRole('link', { name: /edit/i });
    expect(editLink).toHaveAttribute('href', '/products/prod-1/edit');
  });

  it('contains an adjust stock link pointing to /products/[id]/adjust', () => {
    render(<ProductCard product={baseProduct} />);
    const adjustLink = screen.getByRole('link', { name: /ajustar/i });
    expect(adjustLink).toHaveAttribute('href', '/products/prod-1/adjust');
  });
});

// ---------------------------------------------------------------------------
// Pack chip — S1-T9 (RED until S1-T10 adds the conditional chip)
// ---------------------------------------------------------------------------
describe('ProductCard — pack chip (S1-T9)', () => {
  it('does NOT render pack chip for a unit-only product (units_per_package = null)', () => {
    render(<ProductCard product={baseProduct} />);
    expect(screen.queryByText(/paca:/i)).not.toBeInTheDocument();
  });

  it('renders pack chip when units_per_package is set', () => {
    render(
      <ProductCard
        product={{ ...baseProduct, units_per_package: 30, precio_paca: 150 }}
      />
    );
    expect(screen.getByText(/paca:/i)).toBeInTheDocument();
  });

  it('pack chip includes the units_per_package value', () => {
    render(
      <ProductCard
        product={{ ...baseProduct, units_per_package: 30, precio_paca: 150 }}
      />
    );
    expect(screen.getByText(/30\s*u/i)).toBeInTheDocument();
  });

  it('pack chip includes formatted precio_paca', () => {
    render(
      <ProductCard
        product={{ ...baseProduct, units_per_package: 30, precio_paca: 150 }}
      />
    );
    // formatCurrency(150) → "$150.00"
    expect(screen.getByText(/\$150\.00/)).toBeInTheDocument();
  });
});
