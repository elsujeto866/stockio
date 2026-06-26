/**
 * Unit tests for OrderBuilder (WU-B2).
 *
 * Verifies:
 *  - Renders store select and product selector
 *  - Adding a product adds a line item row
 *  - Adding the same productId again MERGES by summing cantidad (no duplicate rows)
 *  - Remove button deletes the line item
 *  - Stepper (+ / −) buttons update cantidad
 *  - Preview total recalculates when items or quantities change
 *  - Submit button is disabled when 0 items
 *  - Submit button is enabled when ≥ 1 item
 *  - Hidden items input contains correct JSON when submitted
 *  - insufficientStock error renders with product name from products prop
 *  - fieldErrors for storeId are shown
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

vi.mock('@/app/(app)/orders/actions', () => ({
  createOrderAction: vi.fn().mockResolvedValue(null),
}));

import { OrderBuilder } from '@/components/orders/OrderBuilder';
import { createOrderAction } from '@/app/(app)/orders/actions';
import type { Store } from '@/lib/data/stores';
import type { Product } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const stores: Store[] = [
  {
    id: 'store-1',
    tenant_id: 't-1',
    nombre: 'Almacén Central',
    contacto: null,
    direccion: null,
    telefono: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const products: Product[] = [
  {
    id: 'prod-1',
    tenant_id: 't-1',
    nombre: 'Widget X',
    sku: null,
    categoria: null,
    precio_unitario: 10.0,
    stock_actual: 50,
    stock_minimo: 5,
    unidad_medida: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'prod-2',
    tenant_id: 't-1',
    nombre: 'Gadget Y',
    sku: null,
    categoria: null,
    precio_unitario: 25.0,
    stock_actual: 20,
    stock_minimo: 2,
    unidad_medida: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createOrderAction).mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function addProduct(productId: string) {
  const selector = screen.getByRole('combobox', { name: /select a product/i });
  fireEvent.change(selector, { target: { value: productId } });
  fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('OrderBuilder — rendering', () => {
  it('renders a store select', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    expect(screen.getByRole('combobox', { name: /store/i })).toBeInTheDocument();
  });

  it('renders a product selector select', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    expect(screen.getByRole('combobox', { name: /select a product/i })).toBeInTheDocument();
  });

  it('submit button is disabled initially (0 items)', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    expect(screen.getByRole('button', { name: /create order/i })).toBeDisabled();
  });
});

describe('OrderBuilder — add item', () => {
  it('adds a row when a product is selected and Add is clicked', () => {
    render(<OrderBuilder stores={stores} products={products} />);

    addProduct('prod-1');

    expect(screen.getByText('Widget X')).toBeInTheDocument();
  });

  it('submit button is enabled after adding an item', () => {
    render(<OrderBuilder stores={stores} products={products} />);

    addProduct('prod-1');

    expect(screen.getByRole('button', { name: /create order/i })).not.toBeDisabled();
  });

  it('merges duplicate productId by summing cantidad (no duplicate rows)', () => {
    render(<OrderBuilder stores={stores} products={products} />);

    addProduct('prod-1');
    addProduct('prod-1'); // adds again → should merge

    const rows = screen.getAllByText('Widget X');
    expect(rows).toHaveLength(1); // still one row

    // Quantity should now be 2
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

describe('OrderBuilder — remove item', () => {
  it('removes the row when Remove is clicked', () => {
    render(<OrderBuilder stores={stores} products={products} />);

    addProduct('prod-1');
    expect(screen.getByText('Widget X')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(screen.queryByText('Widget X')).not.toBeInTheDocument();
  });

  it('disables the submit button again after removing all items', () => {
    render(<OrderBuilder stores={stores} products={products} />);

    addProduct('prod-1');
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(screen.getByRole('button', { name: /create order/i })).toBeDisabled();
  });
});

describe('OrderBuilder — quantity stepper', () => {
  it('increments cantidad when + is clicked', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    // Initial quantity is 1
    expect(screen.getByText('1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }));

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('decrements cantidad when − is clicked (stays ≥ 1)', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }));
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }));
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('decrease button is disabled when cantidad is 1 (cannot go below 1)', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    expect(screen.getByRole('button', { name: /decrease quantity/i })).toBeDisabled();
  });
});

describe('OrderBuilder — preview total', () => {
  it('shows preview total when items are added (price × cantidad)', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1'); // $10.00 × 1

    expect(screen.getByLabelText(/estimated total/i)).toHaveTextContent('$10.00');
  });

  it('preview total updates when cantidad changes', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1'); // $10.00 × 1

    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i })); // × 2

    expect(screen.getByLabelText(/estimated total/i)).toHaveTextContent('$20.00');
  });

  it('preview total sums multiple products', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1'); // $10.00 × 1
    addProduct('prod-2'); // $25.00 × 1  → total $35.00

    expect(screen.getByLabelText(/estimated total/i)).toHaveTextContent('$35.00');
  });
});

describe('OrderBuilder — JSON serialization', () => {
  it('hidden items input contains correct JSON matching current line items', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    const hiddenInput = document.querySelector<HTMLInputElement>('input[name="items"]');
    expect(hiddenInput).not.toBeNull();
    const parsed = JSON.parse(hiddenInput!.value);
    expect(parsed).toEqual([{ productId: 'prod-1', cantidad: 1 }]);
  });

  it('hidden items JSON updates when cantidad changes', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }));

    const hiddenInput = document.querySelector<HTMLInputElement>('input[name="items"]');
    const parsed = JSON.parse(hiddenInput!.value);
    expect(parsed).toEqual([{ productId: 'prod-1', cantidad: 2 }]);
  });
});

describe('OrderBuilder — error display', () => {
  it('renders insufficientStock alert with product name from products prop', async () => {
    vi.mocked(createOrderAction).mockResolvedValue({
      insufficientStock: {
        productId: 'prod-1',
        available: 3,
        requested: 10,
      },
    });

    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Widget X/);
    });
  });

  it('renders fieldErrors for storeId when action returns them', async () => {
    vi.mocked(createOrderAction).mockResolvedValue({
      fieldErrors: { storeId: ['Store is required'] },
    });

    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Store is required')).toBeInTheDocument();
    });
  });
});
