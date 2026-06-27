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
  units_per_package: null,
  precio_paca: null,
  cost_price: null,
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
    expect(screen.getByLabelText(/^nombre/i)).toBeInTheDocument();
  });

  it('renders Group A: sku field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/^sku/i)).toBeInTheDocument();
  });

  it('renders Group A: categoria field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/^categor/i)).toBeInTheDocument();
  });

  it('renders Group A: unidad_medida field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/unidad de medida/i)).toBeInTheDocument();
  });

  it('renders Group B: precio_unitario field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/precio unitario/i)).toBeInTheDocument();
  });

  it('renders Group B: stock_actual field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/stock actual/i)).toBeInTheDocument();
  });

  it('renders Group B: stock_minimo field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/stock m/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mode: create vs edit
// ---------------------------------------------------------------------------
describe('ProductForm — create vs edit mode', () => {
  it('shows "Create product" submit label in create mode', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByRole('button', { name: /crear producto/i })).toBeInTheDocument();
  });

  it('shows "Update product" submit label in edit mode', () => {
    render(<ProductForm action={noop} initialData={product} />);
    expect(screen.getByRole('button', { name: /actualizar producto/i })).toBeInTheDocument();
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
      fieldErrors: { nombre: ['El nombre es obligatorio'] },
    } satisfies ActionResult);

    const { container } = render(<ProductForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Pack fields — S1-T7 (RED until S1-T8 implements the fields)
// ---------------------------------------------------------------------------
describe('ProductForm — pack fields (S1-T7)', () => {
  it('renders Group B: units_per_package field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/unidades por paca/i)).toBeInTheDocument();
  });

  it('renders Group B: precio_paca field', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/precio de paca/i)).toBeInTheDocument();
  });

  it('units_per_package input has type=number, min=2, step=1', () => {
    render(<ProductForm action={noop} />);
    const input = screen.getByLabelText(/unidades por paca/i) as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.min).toBe('2');
    expect(input.step).toBe('1');
  });

  it('precio_paca input has type=number, min=0, step=0.01', () => {
    render(<ProductForm action={noop} />);
    const input = screen.getByLabelText(/precio de paca/i) as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.min).toBe('0');
    expect(input.step).toBe('0.01');
  });

  it('pre-fills units_per_package from initialData', () => {
    const packProduct: Product = {
      ...product,
      units_per_package: 30,
      precio_paca: 150,
    };
    render(<ProductForm action={noop} initialData={packProduct} />);
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
  });

  it('pre-fills precio_paca from initialData', () => {
    const packProduct: Product = {
      ...product,
      units_per_package: 30,
      precio_paca: 150,
    };
    render(<ProductForm action={noop} initialData={packProduct} />);
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();
  });

  it('displays fieldError for units_per_package when action returns that error', async () => {
    const errAction = vi.fn().mockResolvedValue({
      fieldErrors: { units_per_package: ['Las unidades por paca deben ser al menos 2'] },
    } satisfies ActionResult);

    const { container } = render(<ProductForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(
      screen.getByText('Las unidades por paca deben ser al menos 2')
    ).toBeInTheDocument();
  });

  it('displays fieldError for precio_paca when action returns that error', async () => {
    const errAction = vi.fn().mockResolvedValue({
      fieldErrors: { precio_paca: ['Define las unidades por paca para asignar un precio de paca'] },
    } satisfies ActionResult);

    const { container } = render(<ProductForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(
      screen.getByText('Define las unidades por paca para asignar un precio de paca')
    ).toBeInTheDocument();
  });

  it('renders helper text indicating pack fields are optional', () => {
    render(<ProductForm action={noop} />);
    expect(
      screen.getByText(/dejar vacío si el producto se vende solo por unidad/i)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cost price field — S3-T10 (RED until S3-T11 adds the input)
// ---------------------------------------------------------------------------
describe('ProductForm — cost price field (S3-T10)', () => {
  it('renders a "Costo unitario" input', () => {
    render(<ProductForm action={noop} />);
    expect(screen.getByLabelText(/costo unitario/i)).toBeInTheDocument();
  });

  it('cost_price input has name="cost_price"', () => {
    render(<ProductForm action={noop} />);
    const input = screen.getByLabelText(/costo unitario/i) as HTMLInputElement;
    expect(input.name).toBe('cost_price');
  });

  it('cost_price input has type=number, step=0.01, min=0', () => {
    render(<ProductForm action={noop} />);
    const input = screen.getByLabelText(/costo unitario/i) as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.step).toBe('0.01');
    expect(input.min).toBe('0');
  });

  it('cost_price input is NOT required', () => {
    render(<ProductForm action={noop} />);
    const input = screen.getByLabelText(/costo unitario/i) as HTMLInputElement;
    expect(input.required).toBe(false);
  });

  it('pre-fills cost_price from initialData when editing', () => {
    const productWithCost: Product = { ...product, cost_price: 10.0 };
    render(<ProductForm action={noop} initialData={productWithCost} />);
    const input = screen.getByLabelText(/costo unitario/i) as HTMLInputElement;
    expect(input.value).toBe('10');
  });

  it('cost_price input is empty when initialData.cost_price is null', () => {
    const productNoCost: Product = { ...product, cost_price: null };
    render(<ProductForm action={noop} initialData={productNoCost} />);
    const input = screen.getByLabelText(/costo unitario/i) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('displays fieldError for cost_price when action returns that error', async () => {
    const errAction = vi.fn().mockResolvedValue({
      fieldErrors: { cost_price: ['El costo debe ser mayor o igual a 0'] },
    } satisfies ActionResult);

    const { container } = render(<ProductForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(
      screen.getByText('El costo debe ser mayor o igual a 0')
    ).toBeInTheDocument();
  });
});
