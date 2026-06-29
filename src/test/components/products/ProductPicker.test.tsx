/**
 * Tests for ProductPicker component.
 * VPP-T1 (structural / visual) and VPP-T2 (behavioral / interaction).
 *
 * Strict TDD: these tests must be RED before ProductPicker.tsx exists, then
 * GREEN after VPP-T3 implements the component.
 *
 * Dialog mechanic note: <dialog> is always in the DOM (stable ref). Inner
 * content is gated by {open && ...}. jsdom does NOT apply the UA
 * dialog:not([open]){display:none} rule, so children are queryable when open.
 * Tests NEVER assert on showModal() — jsdom lacks it; the feature-detection
 * guard no-ops safely.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Product } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any other imports that depend on them
// ---------------------------------------------------------------------------
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} />
  ),
}));

vi.mock('@/components/products/ProductThumbnail', () => ({
  ProductThumbnail: ({ url, alt }: { url: string | null; alt: string }) =>
    url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt} data-testid="thumbnail-img" />
    ) : (
      <div aria-hidden data-testid="thumbnail-placeholder" />
    ),
}));

// Import AFTER mocks
import { ProductPicker } from '@/components/products/ProductPicker';
import { formatCurrency } from '@/lib/format';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const products: Product[] = [
  {
    id: 'prod-1',
    tenant_id: 't-1',
    nombre: 'Leche',
    sku: 'SKU-001',
    categoria: 'Lácteos',
    precio_unitario: 120,
    stock_actual: 5,
    stock_minimo: 2,
    unidad_medida: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    units_per_package: null,
    precio_paca: null,
    cost_price: null,
    shelf_life_days: null,
    expiry_alert_days: 30,
    image_path: null, // NULL photo — placeholder path
  },
  {
    id: 'prod-2',
    tenant_id: 't-1',
    nombre: 'Queso',
    sku: null,
    categoria: null,
    precio_unitario: 50,
    stock_actual: 0, // zero stock
    stock_minimo: 1,
    unidad_medida: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    units_per_package: null,
    precio_paca: null,
    cost_price: null,
    shelf_life_days: null,
    expiry_alert_days: 30,
    image_path: null,
  },
];

const photoUrls: Record<string, string> = {};
const noop = () => {};

// ---------------------------------------------------------------------------
// VPP-T1: Structural & visual tests (REQ-2 S2-1..S2-3, REQ-6 S6-1..S6-3, REQ-7 S7-1..S7-2)
// ---------------------------------------------------------------------------
describe('ProductPicker — structural (VPP-T1)', () => {
  it('renders one card button per product when open', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    const dialog = screen.getByRole('dialog');
    // Each product card is a <button> whose accessible name contains the nombre
    const lecheCard = within(dialog).getByRole('button', { name: /leche/i });
    const quesoCard = within(dialog).getByRole('button', { name: /queso/i });
    expect(lecheCard).toBeInTheDocument();
    expect(quesoCard).toBeInTheDocument();
  });

  it('each card contains nombre and formatted precio_unitario (S2-1)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Leche')).toBeInTheDocument();
    expect(within(dialog).getByText(formatCurrency(120))).toBeInTheDocument();
    expect(within(dialog).getByText('Queso')).toBeInTheDocument();
    expect(within(dialog).getByText(formatCurrency(50))).toBeInTheDocument();
  });

  it('product with image_path=null renders placeholder, no broken img (S2-2, S7-2)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    // Both products have no photo URL → placeholders rendered
    const placeholders = screen.getAllByTestId('thumbnail-placeholder');
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
    // No real image (no URL provided in photoUrls)
    expect(screen.queryAllByTestId('thumbnail-img')).toHaveLength(0);
  });

  it('stock badge shows Stock: N for products with stock (S2-1)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByText('Stock: 5')).toBeInTheDocument();
  });

  it('product with stock_actual=0 shows "Sin stock" text (S2-3)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByText('Sin stock')).toBeInTheDocument();
  });

  it('product with stock_actual=0 card is NOT disabled and fires onSelect on click (S2-3)', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={onClose}
        onSelect={onSelect}
      />
    );
    const dialog = screen.getByRole('dialog');
    const quesoCard = within(dialog).getByRole('button', { name: /queso/i });
    expect(quesoCard).not.toBeDisabled();
    fireEvent.click(quesoCard);
    expect(onSelect).toHaveBeenCalledWith(products[1]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('products=[] renders "No hay productos disponibles" (S7-1)', () => {
    render(
      <ProductPicker
        products={[]}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByText('No hay productos disponibles')).toBeInTheDocument();
  });

  it('dialog has aria-label "Seleccionar producto" (S6-1)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Seleccionar producto' })).toBeInTheDocument();
  });

  it('search input has aria-label "Buscar producto" (S6-3)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByLabelText('Buscar producto')).toBeInTheDocument();
  });

  it('photoUrls provided → thumbnail img renders for that product', () => {
    const urlMap = { 'prod-1': 'https://example.com/leche.jpg' };
    render(
      <ProductPicker
        products={products}
        photoUrls={urlMap}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    // prod-1 (Leche) has a URL → thumbnail-img shown
    expect(screen.getByTestId('thumbnail-img')).toBeInTheDocument();
    // prod-2 (Queso) has no URL → placeholder shown
    expect(screen.getByTestId('thumbnail-placeholder')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// VPP-T2: Behavioral & interaction tests (REQ-1 S1-2..S1-3, REQ-3 S3-1..S3-5, REQ-4 S4-1)
// ---------------------------------------------------------------------------
describe('ProductPicker — behavioral (VPP-T2)', () => {
  it('typing in search filters by nombre case-insensitively (S3-1)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    const input = screen.getByLabelText('Buscar producto');
    fireEvent.change(input, { target: { value: 'lech' } });

    // In the unit test there is nothing else on the page, so scoping to
    // screen is safe and avoids stale-reference issues with within(dialog).
    expect(screen.getByText('Leche')).toBeInTheDocument();
    expect(screen.queryByText('Queso')).not.toBeInTheDocument();
  });

  it('typing in search filters by sku case-insensitively (S3-2)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    const input = screen.getByLabelText('Buscar producto');
    fireEvent.change(input, { target: { value: 'sku-001' } });

    expect(screen.getByText('Leche')).toBeInTheDocument(); // Leche has SKU-001
    expect(screen.queryByText('Queso')).not.toBeInTheDocument();
  });

  it('typing in search filters by categoria case-insensitively (S3-3)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    const input = screen.getByLabelText('Buscar producto');
    fireEvent.change(input, { target: { value: 'lact' } });

    expect(screen.getByText('Leche')).toBeInTheDocument(); // categoria Lácteos
    expect(screen.queryByText('Queso')).not.toBeInTheDocument();
  });

  it('no matches → "Sin resultados para" empty state (S3-4)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    const input = screen.getByLabelText('Buscar producto');
    fireEvent.change(input, { target: { value: 'xyzzy' } });

    expect(screen.getByText(/sin resultados para/i)).toBeInTheDocument();
    expect(screen.queryByText('Leche')).not.toBeInTheDocument();
    expect(screen.queryByText('Queso')).not.toBeInTheDocument();
  });

  it('clearing search restores full grid (S3-5)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={noop}
        onSelect={noop}
      />
    );
    const input = screen.getByLabelText('Buscar producto');
    fireEvent.change(input, { target: { value: 'lech' } });
    expect(screen.queryByText('Queso')).not.toBeInTheDocument();

    // Clear the search
    fireEvent.change(input, { target: { value: '' } });

    expect(screen.getByText('Leche')).toBeInTheDocument();
    expect(screen.getByText('Queso')).toBeInTheDocument();
  });

  it('clicking a card calls onSelect with the product and then onClose (S4-1)', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={true}
        onClose={onClose}
        onSelect={onSelect}
      />
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /leche/i }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(products[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('open={false} → dialog in DOM but no product cards rendered (S1-2 jsdom invariant)', () => {
    render(
      <ProductPicker
        products={products}
        photoUrls={photoUrls}
        open={false}
        onClose={noop}
        onSelect={noop}
      />
    );
    // <dialog> always mounted for stable ref — NEVER assert on showModal.
    // When closed, the dialog lacks the `open` attribute (jsdom applies
    // dialog:not([open]){display:none}), so we query via querySelector
    // instead of getByRole which respects the accessibility tree.
    expect(document.querySelector('dialog')).not.toBeNull();
    // Inner content gated by {open && ...}: product cards NOT in DOM at all.
    expect(screen.queryByText('Leche')).not.toBeInTheDocument();
    expect(screen.queryByText('Queso')).not.toBeInTheDocument();
  });
});
