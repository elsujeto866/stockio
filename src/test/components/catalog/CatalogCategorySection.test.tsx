/**
 * Unit tests for CatalogCategorySection (PC-T9).
 *
 * Covers:
 *  - renders category title heading with correct text
 *  - renders one CatalogProductCard per product
 *  - print:break-before-page class PRESENT on section wrapper when isFirst=false
 *  - print:break-before-page class ABSENT when isFirst=true
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Product } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Mocks — next/image so ProductThumbnail renders without a loader
// ---------------------------------------------------------------------------
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
    loading,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
    loading?: 'eager' | 'lazy';
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} className={className} data-loading={loading} />
  ),
}));

import { CatalogCategorySection } from '@/components/catalog/CatalogCategorySection';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeProduct(id: string, nombre: string): Product {
  return {
    id,
    tenant_id: 't1',
    nombre,
    sku: null,
    categoria: 'Galletas',
    precio_unitario: 1000,
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
}

const products = [
  makeProduct('p1', 'Galleta A'),
  makeProduct('p2', 'Galleta B'),
];

const emptyPhotoUrls = new Map<string, string>();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CatalogCategorySection — heading', () => {
  it('renders the categoria as a heading', () => {
    render(
      <CatalogCategorySection
        categoria="Galletas"
        products={products}
        photoUrls={emptyPhotoUrls}
        isFirst={true}
      />
    );
    expect(screen.getByRole('heading', { name: 'Galletas' })).toBeInTheDocument();
  });
});

describe('CatalogCategorySection — product cards', () => {
  it('renders one card per product in the products array', () => {
    render(
      <CatalogCategorySection
        categoria="Galletas"
        products={products}
        photoUrls={emptyPhotoUrls}
        isFirst={true}
      />
    );
    expect(screen.getByText('Galleta A')).toBeInTheDocument();
    expect(screen.getByText('Galleta B')).toBeInTheDocument();
  });
});

describe('CatalogCategorySection — print:break-before-page', () => {
  it('section wrapper does NOT have print:break-before-page when isFirst=true', () => {
    const { container } = render(
      <CatalogCategorySection
        categoria="Galletas"
        products={products}
        photoUrls={emptyPhotoUrls}
        isFirst={true}
      />
    );
    const section = container.querySelector('section');
    expect(section?.className).not.toContain('print:break-before-page');
  });

  it('section wrapper HAS print:break-before-page when isFirst=false', () => {
    const { container } = render(
      <CatalogCategorySection
        categoria="Galletas"
        products={products}
        photoUrls={emptyPhotoUrls}
        isFirst={false}
      />
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('print:break-before-page');
  });
});

describe('CatalogCategorySection — print:text-black on heading', () => {
  it('category h2 carries print:text-black so headings are dark when printed', () => {
    render(
      <CatalogCategorySection
        categoria="Galletas"
        products={products}
        photoUrls={emptyPhotoUrls}
        isFirst={true}
      />
    );
    const heading = screen.getByRole('heading', { name: 'Galletas' });
    expect(heading.className).toContain('print:text-black');
  });
});
