/**
 * Unit tests for CatalogProductCard (PC-T8).
 *
 * HIGHEST-VALUE tests — verifies null-guard on every optional field.
 *
 * Covers:
 *  S4-1: all chips render when every field is populated
 *  S4-2a: NULL presentacion → chip absent, no "null" string in DOM
 *  S4-2b: NULL sku → "Cód." label absent, "Cód. null" never in DOM
 *  S4-2c: NULL units_per_package → "U. x" label absent
 *  S4-2d: NULL shelf_life_days → "Vida útil" label absent
 *  S6-4: loading="eager" forwarded to ProductThumbnail img
 *  S6-3: print:break-inside-avoid class present on article wrapper
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Product } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// next/image mock — forwards loading as data-loading attribute
// ---------------------------------------------------------------------------
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    unoptimized,
    className,
    loading,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    unoptimized?: boolean;
    className?: string;
    loading?: 'eager' | 'lazy';
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      data-unoptimized={unoptimized}
      className={className}
      data-loading={loading}
    />
  ),
}));

import { CatalogProductCard } from '@/components/catalog/CatalogProductCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const fullProduct: Product = {
  id: 'p-full',
  tenant_id: 't1',
  nombre: 'Galleta Salada',
  sku: 'G-001',
  categoria: 'Galletas',
  precio_unitario: 1500,
  stock_actual: 50,
  stock_minimo: 5,
  unidad_medida: null,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  units_per_package: 12,
  precio_paca: 15000,
  cost_price: null,
  shelf_life_days: 180,
  expiry_alert_days: 30,
  image_path: 't1/p-full.jpg',
  presentacion: '70 g',
};

const nullProduct: Product = {
  id: 'p-null',
  tenant_id: 't1',
  nombre: 'Cracker',
  sku: null,
  categoria: null,
  precio_unitario: 900,
  stock_actual: 10,
  stock_minimo: 2,
  unidad_medida: null,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  units_per_package: null,
  precio_paca: null,
  cost_price: null,
  shelf_life_days: null,
  expiry_alert_days: 30,
  image_path: null,
  presentacion: null,
};

// ---------------------------------------------------------------------------
// S4-1: fully populated card
// ---------------------------------------------------------------------------
describe('CatalogProductCard — S4-1 (all chips render when every field is populated)', () => {
  it('renders nombre', () => {
    render(<CatalogProductCard product={fullProduct} photoUrl="https://example.com/photo.jpg" />);
    expect(screen.getByText('Galleta Salada')).toBeInTheDocument();
  });

  it('renders P.V.P price', () => {
    render(<CatalogProductCard product={fullProduct} photoUrl="https://example.com/photo.jpg" />);
    expect(screen.getByText(/P\.V\.P/)).toBeInTheDocument();
  });

  it('renders presentacion chip when populated', () => {
    render(<CatalogProductCard product={fullProduct} photoUrl="https://example.com/photo.jpg" />);
    expect(screen.getByText('70 g')).toBeInTheDocument();
  });

  it('renders sku chip when populated', () => {
    render(<CatalogProductCard product={fullProduct} photoUrl="https://example.com/photo.jpg" />);
    expect(screen.getByText(/Cód\. G-001/)).toBeInTheDocument();
  });

  it('renders units_per_package chip when populated', () => {
    render(<CatalogProductCard product={fullProduct} photoUrl="https://example.com/photo.jpg" />);
    expect(screen.getByText(/U\. x 12/)).toBeInTheDocument();
  });

  it('renders shelf_life_days chip when populated', () => {
    render(<CatalogProductCard product={fullProduct} photoUrl="https://example.com/photo.jpg" />);
    expect(screen.getByText(/Vida útil 180 días/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// S4-2a: NULL presentacion → chip absent
// ---------------------------------------------------------------------------
describe('CatalogProductCard — S4-2a (NULL presentacion omitted)', () => {
  it('does NOT render a presentacion chip when presentacion is null', () => {
    render(<CatalogProductCard product={nullProduct} photoUrl={null} />);
    // The word "null" must not appear anywhere in the DOM
    expect(document.body.textContent).not.toContain('null');
  });
});

// ---------------------------------------------------------------------------
// S4-2b: NULL sku → "Cód." label absent
// ---------------------------------------------------------------------------
describe('CatalogProductCard — S4-2b (NULL sku omitted)', () => {
  it('does NOT render "Cód." label when sku is null', () => {
    render(<CatalogProductCard product={nullProduct} photoUrl={null} />);
    expect(screen.queryByText(/Cód\./)).not.toBeInTheDocument();
  });

  it('does NOT render the string "Cód. null" anywhere in the DOM', () => {
    render(<CatalogProductCard product={nullProduct} photoUrl={null} />);
    expect(document.body.textContent).not.toContain('Cód. null');
  });
});

// ---------------------------------------------------------------------------
// S4-2c: NULL units_per_package → "U. x" label absent
// ---------------------------------------------------------------------------
describe('CatalogProductCard — S4-2c (NULL units_per_package omitted)', () => {
  it('does NOT render "U. x" label when units_per_package is null', () => {
    render(<CatalogProductCard product={nullProduct} photoUrl={null} />);
    expect(screen.queryByText(/U\. x/)).not.toBeInTheDocument();
  });

  it('does NOT render the string "U. x null" anywhere in the DOM', () => {
    render(<CatalogProductCard product={nullProduct} photoUrl={null} />);
    expect(document.body.textContent).not.toContain('U. x null');
  });
});

// ---------------------------------------------------------------------------
// S4-2d: NULL shelf_life_days → "Vida útil" label absent
// ---------------------------------------------------------------------------
describe('CatalogProductCard — S4-2d (NULL shelf_life_days omitted)', () => {
  it('does NOT render "Vida útil" label when shelf_life_days is null', () => {
    render(<CatalogProductCard product={nullProduct} photoUrl={null} />);
    expect(screen.queryByText(/Vida útil/)).not.toBeInTheDocument();
  });

  it('does NOT render "Vida útil null días" anywhere in the DOM', () => {
    render(<CatalogProductCard product={nullProduct} photoUrl={null} />);
    expect(document.body.textContent).not.toContain('Vida útil null');
  });
});

// ---------------------------------------------------------------------------
// S6-4: loading="eager" forwarded to ProductThumbnail img
// ---------------------------------------------------------------------------
describe('CatalogProductCard — S6-4 (loading="eager" forwarded to ProductThumbnail)', () => {
  it('renders img with data-loading="eager" when photoUrl is set', () => {
    render(<CatalogProductCard product={fullProduct} photoUrl="https://example.com/photo.jpg" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('data-loading')).toBe('eager');
  });
});

// ---------------------------------------------------------------------------
// S6-3: print:break-inside-avoid class on article wrapper
// ---------------------------------------------------------------------------
describe('CatalogProductCard — S6-3 (print:break-inside-avoid on article)', () => {
  it('article wrapper has print:break-inside-avoid class', () => {
    const { container } = render(
      <CatalogProductCard product={fullProduct} photoUrl="https://example.com/photo.jpg" />
    );
    const article = container.querySelector('article');
    expect(article?.className).toContain('print:break-inside-avoid');
  });
});
