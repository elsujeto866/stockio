/**
 * Unit tests for StockAdjustForm.
 *
 * Verifies:
 *  - Delta input is rendered
 *  - +/- buttons are present with accessible labels (≥ 44px enforced via CSS)
 *  - Clicking + increments the delta input value
 *  - Clicking - decrements the delta input value
 *  - Error message is displayed when action returns an error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { StockAdjustForm } from '@/components/products/StockAdjustForm';
import type { ActionResult } from '@/app/(app)/products/actions';
import type { Product } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const noop = vi.fn().mockResolvedValue(null as ActionResult);

const product: Product = {
  id: 'prod-1',
  tenant_id: 't-1',
  nombre: 'Aceite de Oliva',
  sku: 'OL-001',
  categoria: 'Alimentos',
  precio_unitario: 12.5,
  stock_actual: 50,
  stock_minimo: 10,
  unidad_medida: 'litro',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
describe('StockAdjustForm — rendering', () => {
  it('renders the delta input', () => {
    render(<StockAdjustForm action={noop} product={product} />);
    expect(screen.getByLabelText(/adjustment/i)).toBeInTheDocument();
  });

  it('renders the + button', () => {
    render(<StockAdjustForm action={noop} product={product} />);
    expect(screen.getByLabelText('Increase stock')).toBeInTheDocument();
  });

  it('renders the - button', () => {
    render(<StockAdjustForm action={noop} product={product} />);
    expect(screen.getByLabelText('Decrease stock')).toBeInTheDocument();
  });

  it('shows the current stock of the product', () => {
    render(<StockAdjustForm action={noop} product={product} />);
    expect(screen.getByText(/50/)).toBeInTheDocument();
  });

  it('renders a submit button', () => {
    render(<StockAdjustForm action={noop} product={product} />);
    expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// +/- button interaction
// ---------------------------------------------------------------------------
describe('StockAdjustForm — button interaction', () => {
  it('+ button increments the delta input value', () => {
    render(<StockAdjustForm action={noop} product={product} />);
    const deltaInput = screen.getByLabelText(/adjustment/i) as HTMLInputElement;
    const plusBtn = screen.getByLabelText('Increase stock');

    expect(deltaInput.value).toBe('0');
    fireEvent.click(plusBtn);
    expect(deltaInput.value).toBe('1');
  });

  it('- button decrements the delta input value', () => {
    render(<StockAdjustForm action={noop} product={product} />);
    const deltaInput = screen.getByLabelText(/adjustment/i) as HTMLInputElement;
    const minusBtn = screen.getByLabelText('Decrease stock');

    expect(deltaInput.value).toBe('0');
    fireEvent.click(minusBtn);
    expect(deltaInput.value).toBe('-1');
  });

  it('accumulates clicks: clicking + three times gives delta = 3', () => {
    render(<StockAdjustForm action={noop} product={product} />);
    const deltaInput = screen.getByLabelText(/adjustment/i) as HTMLInputElement;
    const plusBtn = screen.getByLabelText('Increase stock');

    fireEvent.click(plusBtn);
    fireEvent.click(plusBtn);
    fireEvent.click(plusBtn);
    expect(deltaInput.value).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------
describe('StockAdjustForm — error display', () => {
  it('shows error message when action returns StockUnderflowError message', async () => {
    const errAction = vi.fn().mockResolvedValue({
      error: 'Stock cannot go below zero',
    } satisfies ActionResult);

    const { container } = render(
      <StockAdjustForm action={errAction} product={product} />
    );

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(screen.getByText('Stock cannot go below zero')).toBeInTheDocument();
  });
});
