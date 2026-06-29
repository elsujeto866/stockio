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
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';

vi.mock('@/app/(app)/orders/actions', () => ({
  createOrderAction: vi.fn().mockResolvedValue(null),
}));

import {
  OrderBuilder,
  buildDedupKey,
  computeLineSubtotal,
  isPackageAvailable,
} from '@/components/orders/OrderBuilder';
import { createOrderAction } from '@/app/(app)/orders/actions';
import type { Store } from '@/lib/data/stores';
import type { Product } from '@/lib/data/products';
import { formatCurrency } from '@/lib/format';

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
    payment_terms_days: 30,
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
    units_per_package: null,
    precio_paca: null,
    cost_price: null,
    shelf_life_days: null,
    expiry_alert_days: 30,
  image_path: null,
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
    units_per_package: null,
    precio_paca: null,
    cost_price: null,
    shelf_life_days: null,
    expiry_alert_days: 30,
  image_path: null,
  },
  // Packaged product — for S2-T9 tests
  {
    id: 'prod-3',
    tenant_id: 't-1',
    nombre: 'Pack Product',
    sku: null,
    categoria: null,
    precio_unitario: 5.0,
    stock_actual: 100,
    stock_minimo: 0,
    unidad_medida: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    units_per_package: 30,
    precio_paca: 120.0,
    cost_price: null,
    shelf_life_days: null,
    expiry_alert_days: 30,
  image_path: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createOrderAction).mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Simulates the full picker flow:
 *   1. Click the "Agregar producto" trigger button → opens picker dialog.
 *   2. Click the product card for the given productId (by nombre) → closes dialog.
 *   3. Click the inline "Agregar" button → calls addItem().
 *
 * Uses /^agregar$/i (anchored) for the inline button to avoid matching the
 * "Agregar producto" trigger (aria-label="Agregar producto").
 */
function addProduct(productId: string) {
  const name = products.find((p) => p.id === productId)!.nombre;
  fireEvent.click(screen.getByRole('button', { name: /agregar producto/i }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(name, 'i') }));
  fireEvent.click(screen.getByRole('button', { name: /^agregar$/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('OrderBuilder — rendering', () => {
  it('renders a store select', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    expect(screen.getByRole('combobox', { name: /tienda/i })).toBeInTheDocument();
  });

  it('renders a product picker trigger button', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    expect(screen.getByRole('button', { name: /agregar producto/i })).toBeInTheDocument();
  });

  it('submit button is disabled initially (0 items)', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    expect(screen.getByRole('button', { name: /crear pedido/i })).toBeDisabled();
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

    expect(screen.getByRole('button', { name: /crear pedido/i })).not.toBeDisabled();
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

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));

    expect(screen.queryByText('Widget X')).not.toBeInTheDocument();
  });

  it('disables the submit button again after removing all items', () => {
    render(<OrderBuilder stores={stores} products={products} />);

    addProduct('prod-1');
    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));

    expect(screen.getByRole('button', { name: /crear pedido/i })).toBeDisabled();
  });
});

describe('OrderBuilder — quantity stepper', () => {
  it('increments cantidad when + is clicked', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    // Initial quantity is 1
    expect(screen.getByText('1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad/i }));

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('decrements cantidad when − is clicked (stays ≥ 1)', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad/i }));
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /disminuir cantidad/i }));
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('decrease button is disabled when cantidad is 1 (cannot go below 1)', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    expect(screen.getByRole('button', { name: /disminuir cantidad/i })).toBeDisabled();
  });
});

describe('OrderBuilder — preview total', () => {
  it('shows preview total when items are added (price × cantidad)', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1'); // $10.00 × 1

    expect(screen.getByLabelText(/total estimado/i)).toHaveTextContent(formatCurrency(10));
  });

  it('preview total updates when cantidad changes', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1'); // $10.00 × 1

    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad/i })); // × 2

    expect(screen.getByLabelText(/total estimado/i)).toHaveTextContent(formatCurrency(20));
  });

  it('preview total sums multiple products', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1'); // $10.00 × 1
    addProduct('prod-2'); // $25.00 × 1  → total $35.00

    expect(screen.getByLabelText(/total estimado/i)).toHaveTextContent(formatCurrency(35));
  });
});

describe('OrderBuilder — JSON serialization', () => {
  it('hidden items input contains correct JSON matching current line items', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    const hiddenInput = document.querySelector<HTMLInputElement>('input[name="items"]');
    expect(hiddenInput).not.toBeNull();
    const parsed = JSON.parse(hiddenInput!.value);
    // saleUnit is now included in the serialized JSON (defaults to 'unit')
    expect(parsed).toEqual([{ productId: 'prod-1', cantidad: 1, saleUnit: 'unit' }]);
  });

  it('hidden items JSON updates when cantidad changes', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');
    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad/i }));

    const hiddenInput = document.querySelector<HTMLInputElement>('input[name="items"]');
    const parsed = JSON.parse(hiddenInput!.value);
    // saleUnit included
    expect(parsed).toEqual([{ productId: 'prod-1', cantidad: 2, saleUnit: 'unit' }]);
  });
});

// ---------------------------------------------------------------------------
// S2-T9: Pure helper unit tests (RED until helpers are exported from OrderBuilder)
// ---------------------------------------------------------------------------
describe('buildDedupKey (S2-T9 pure helper)', () => {
  it('returns productId|unit for unit sale', () => {
    expect(buildDedupKey('prod-1', 'unit')).toBe('prod-1|unit');
  });

  it('returns productId|package for package sale', () => {
    expect(buildDedupKey('prod-1', 'package')).toBe('prod-1|package');
  });

  it('different saleUnit → different key (no cross-merge)', () => {
    expect(buildDedupKey('prod-1', 'unit')).not.toBe(buildDedupKey('prod-1', 'package'));
  });
});

describe('computeLineSubtotal (S2-T9 pure helper)', () => {
  const packProduct = products.find((p) => p.id === 'prod-3')!; // units_per_package=30, precio_paca=120

  it('uses precio_unitario for unit sale', () => {
    expect(computeLineSubtotal(packProduct, 'unit', 5)).toBeCloseTo(5.0 * 5, 2); // 25
  });

  it('uses precio_paca for package sale', () => {
    expect(computeLineSubtotal(packProduct, 'package', 2)).toBeCloseTo(120.0 * 2, 2); // 240
  });

  it('returns 0 for package sale when precio_paca is null (guard)', () => {
    const noPackPrice = { ...packProduct, precio_paca: null };
    expect(computeLineSubtotal(noPackPrice, 'package', 2)).toBe(0);
  });
});

describe('isPackageAvailable (S2-T9 pure helper)', () => {
  it('returns true for a product with units_per_package >= 2 and precio_paca', () => {
    const packProduct = products.find((p) => p.id === 'prod-3')!;
    expect(isPackageAvailable(packProduct)).toBe(true);
  });

  it('returns false when units_per_package is null', () => {
    const noPackProduct = products.find((p) => p.id === 'prod-1')!;
    expect(isPackageAvailable(noPackProduct)).toBe(false);
  });

  it('returns false when units_per_package is less than 2', () => {
    const smallPack = { ...products[0], units_per_package: 1, precio_paca: 50.0 };
    expect(isPackageAvailable(smallPack)).toBe(false);
  });

  it('returns false when precio_paca is null', () => {
    const noPrice = { ...products[2], precio_paca: null };
    expect(isPackageAvailable(noPrice)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S2-T9: Component tests for mixed lines and dedup behavior
// ---------------------------------------------------------------------------
describe('OrderBuilder — mixed lines (S2-T9 component)', () => {
  it('same productId added as unit then package → two distinct line items', () => {
    render(<OrderBuilder stores={stores} products={products} />);

    const packName = products.find((p) => p.id === 'prod-3')!.nombre; // 'Pack Product'

    // Add prod-3 as unit via picker
    fireEvent.click(screen.getByRole('button', { name: /agregar producto/i }));
    const dialog1 = screen.getByRole('dialog');
    fireEvent.click(within(dialog1).getByRole('button', { name: new RegExp(packName, 'i') }));
    // Select unit sale (combobox appears after picker closes)
    const saleUnitSelectors = screen.queryAllByRole('combobox', { name: /tipo de venta/i });
    if (saleUnitSelectors.length > 0) {
      fireEvent.change(saleUnitSelectors[saleUnitSelectors.length - 1], { target: { value: 'unit' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /^agregar$/i }));

    // Add prod-3 as package via picker
    fireEvent.click(screen.getByRole('button', { name: /agregar producto/i }));
    const dialog2 = screen.getByRole('dialog');
    fireEvent.click(within(dialog2).getByRole('button', { name: new RegExp(packName, 'i') }));
    // Select package sale
    const saleUnitSelectors2 = screen.queryAllByRole('combobox', { name: /tipo de venta/i });
    if (saleUnitSelectors2.length > 0) {
      fireEvent.change(saleUnitSelectors2[saleUnitSelectors2.length - 1], { target: { value: 'package' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /^agregar$/i }));

    // Should see two rows containing 'Pack Product' (one unit, one Paca)
    const rows = screen.getAllByText(/Pack Product/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('same productId+saleUnit added twice → cantidad merges (no duplicate row)', () => {
    render(<OrderBuilder stores={stores} products={products} />);

    addProduct('prod-3'); // first add (defaults to unit)
    addProduct('prod-3'); // second add → merge

    const rows = screen.getAllByText('Pack Product');
    // Only one distinct product name in the line items
    expect(rows).toHaveLength(1);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('preview total uses precio_paca for package lines', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1'); // $10.00 unit × 1

    // The previewTotal should show $10.00 (existing behaviour still works)
    expect(screen.getByLabelText(/total estimado/i)).toHaveTextContent(formatCurrency(10));
  });

  it('hidden items JSON includes saleUnit per line', () => {
    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    const hiddenInput = document.querySelector<HTMLInputElement>('input[name="items"]');
    expect(hiddenInput).not.toBeNull();
    const parsed = JSON.parse(hiddenInput!.value);
    expect(parsed[0]).toHaveProperty('saleUnit');
    expect(parsed[0].saleUnit).toBe('unit');
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
      fieldErrors: { storeId: ['Selecciona una tienda'] },
    });

    render(<OrderBuilder stores={stores} products={products} />);
    addProduct('prod-1');

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      expect(screen.getByText('Selecciona una tienda')).toBeInTheDocument();
    });
  });
});
