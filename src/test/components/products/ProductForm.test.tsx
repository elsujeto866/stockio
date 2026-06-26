/**
 * Unit tests for ProductForm.
 *
 * Verifies:
 *  - Group A fields (nombre, sku, categoria, unidad_medida) are rendered
 *  - Group B numeric fields (precio_unitario, stock_actual, stock_minimo) are rendered
 *  - Create mode shows "Create product" submit button
 *  - Edit mode shows "Update product" submit button and pre-fills values
 *  - fieldErrors from state are displayed next to the relevant input
 *  - Generic error banner is shown when state has an error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ProductForm } from '@/components/products/ProductForm';
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
  stock_actual: 100,
  stock_minimo: 10,
  unidad_medida: 'litro',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Field rendering
// ---------------------------------------------------------------------------
describe('ProductForm — field rendering', () => {
  it('renders Group A: nombre field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
  });

  it('renders Group A: sku field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/^sku/i)).toBeInTheDocument();
  });

  it('renders Group A: categoria field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/^category/i)).toBeInTheDocument();
  });

  it('renders Group A: unidad_medida field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/unit of measure/i)).toBeInTheDocument();
  });

  it('renders Group B: precio_unitario field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/unit price/i)).toBeInTheDocument();
  });

  it('renders Group B: stock_actual field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/current stock/i)).toBeInTheDocument();
  });

  it('renders Group B: stock_minimo field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/minimum stock/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mode: create vs edit
// ---------------------------------------------------------------------------
describe('ProductForm — create vs edit mode', () => {
  it('shows "Create product" submit label in create mode', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByRole('button', { name: /create product/i })).toBeInTheDocument();
  });

  it('shows "Update product" submit label in edit mode', () => {
    render(<ProductForm action={noop} initialData={product} />);
    expect(screen.getByRole('button', { name: /update product/i })).toBeInTheDocument();
  });

  it('pre-fills the nombre field from initialData', () => {
    render(<ProductForm action={noop} initialData={product} />);
    expect(screen.getByDisplayValue('Aceite de Oliva')).toBeInTheDocument();
  });

  it('pre-fills numeric fields from initialData', () => {
    render(<ProductForm action={noop} initialData={product} />);
    expect(screen.getByDisplayValue('100')).toBeInTheDocument(); // stock_actual
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();  // stock_minimo
  });
});

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------
describe('ProductForm — error display', () => {
  it('displays a field error under nombre when action returns fieldErrors', async () => {
    const errAction = vi.fn().mockResolvedValue({
      fieldErrors: { nombre: ['Name is required'] },
    } satisfies ActionResult);

    const { container } = render(<ProductForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('displays a top-level error banner when action returns an error', async () => {
    const errAction = vi.fn().mockResolvedValue({
      error: 'Something went wrong',
    } satisfies ActionResult);

    const { container } = render(<ProductForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
