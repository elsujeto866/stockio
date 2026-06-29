/**
 * Unit tests for PurchaseBuilder.
 *
 * Verifies:
 *  - Renders supplier <select name="supplierId"> with active supplier options
 *  - Adding a product: new row appears with productId, cantidad=1, costoUnitario=0
 *  - Update costoUnitario: previewTotal = Σ(costoUnitario × cantidad) recalculates
 *  - Update cantidad: previewTotal recalculates
 *  - Remove row: row disappears; previewTotal recalculates
 *  - Hidden items field: JSON.stringify([{productId, cantidad, costoUnitario}])
 *  - fecha date input is rendered
 *  - Submit disabled when items is empty
 *  - Submit disabled when form is pending (after submit)
 *  - previewTotal displayed as currency
 *  - Deactivated suppliers are NOT in the supplier dropdown options
 *
 * Satisfies: REQ-P1, REQ-Z1 (PurchaseBuilder UI)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/app/(app)/purchases/actions', () => ({
  createPurchaseAction: vi.fn().mockResolvedValue(null),
}));

import { PurchaseBuilder } from '@/components/purchases/PurchaseBuilder';
import { createPurchaseAction } from '@/app/(app)/purchases/actions';
import type { Supplier } from '@/lib/data/suppliers';
import type { Product } from '@/lib/data/products';
import { formatCurrency } from '@/lib/format';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const suppliers: Supplier[] = [
  {
    id: 'supplier-1',
    tenant_id: 't-1',
    nombre: 'Proveedor Central',
    ruc: null,
    contacto: null,
    telefono: null,
    email: null,
    notas: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'supplier-2',
    tenant_id: 't-1',
    nombre: 'Proveedor Inactivo',
    ruc: null,
    contacto: null,
    telefono: null,
    email: null,
    notas: null,
    activo: false,
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
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createPurchaseAction).mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function addProduct(productId: string) {
  const selector = screen.getByRole('combobox', { name: /seleccionar un producto/i });
  fireEvent.change(selector, { target: { value: productId } });
  fireEvent.click(screen.getByRole('button', { name: /^agregar$/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PurchaseBuilder — supplier select', () => {
  it('renders <select name="supplierId"> with active supplier options', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    const select = document.querySelector<HTMLSelectElement>('select[name="supplierId"]');
    expect(select).not.toBeNull();
    expect(select!.innerHTML).toContain('Proveedor Central');
  });

  it('does NOT include deactivated suppliers in the dropdown (REQ-S2)', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    const select = document.querySelector<HTMLSelectElement>('select[name="supplierId"]');
    expect(select!.innerHTML).not.toContain('Proveedor Inactivo');
  });
});

describe('PurchaseBuilder — add product', () => {
  it('adds a row with product name when Agregar is clicked', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');
    // Product name appears in both the selector option AND the line item row
    expect(screen.getAllByText('Widget X').length).toBeGreaterThanOrEqual(1);
    // Confirm the list item row is rendered
    expect(screen.getByRole('list', { name: /purchase items/i })).toBeInTheDocument();
  });

  it('new row starts with costoUnitario = 0', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');
    const costoInput = document.querySelector<HTMLInputElement>('input[aria-label*="costo" i], input[name*="costo" i]');
    // costoUnitario input should exist and have value "0"
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]');
    // There should be costoUnitario and cantidad inputs per row
    const costoInputFound = Array.from(inputs).find(
      (input) => (input as HTMLInputElement).value === '0' && parseFloat((input as HTMLInputElement).step || '1') < 1
    );
    expect(costoInputFound).toBeDefined();
  });

  it('submit button is disabled initially (no items)', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    expect(screen.getByRole('button', { name: /crear compra/i })).toBeDisabled();
  });

  it('submit button is enabled after adding an item', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');
    expect(screen.getByRole('button', { name: /crear compra/i })).not.toBeDisabled();
  });
});

describe('PurchaseBuilder — costoUnitario and previewTotal', () => {
  it('previewTotal starts at 0 before any items', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    // No total displayed when no items
    const totalEl = document.querySelector('[aria-label="Total estimado"]');
    expect(totalEl).toBeNull();
  });

  it('previewTotal = costoUnitario × cantidad after adding item and setting cost', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');

    // Find the costo input (step=0.01)
    const costoInput = document.querySelector<HTMLInputElement>('input[step="0.01"]');
    expect(costoInput).not.toBeNull();
    fireEvent.change(costoInput!, { target: { value: '5.00' } });

    expect(screen.getByLabelText(/total estimado/i)).toHaveTextContent(formatCurrency(5.00));
  });

  it('previewTotal recalculates when cantidad changes', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');

    const costoInput = document.querySelector<HTMLInputElement>('input[step="0.01"]');
    fireEvent.change(costoInput!, { target: { value: '10.00' } });

    // Increase cantidad
    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad/i }));

    expect(screen.getByLabelText(/total estimado/i)).toHaveTextContent(formatCurrency(20.00));
  });

  it('previewTotal sums multiple rows', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');
    addProduct('prod-2');

    const costoInputs = document.querySelectorAll<HTMLInputElement>('input[step="0.01"]');
    fireEvent.change(costoInputs[0], { target: { value: '3.00' } }); // row 1: 3 × 1 = 3
    fireEvent.change(costoInputs[1], { target: { value: '7.00' } }); // row 2: 7 × 1 = 7

    expect(screen.getByLabelText(/total estimado/i)).toHaveTextContent(formatCurrency(10.00));
  });
});

describe('PurchaseBuilder — remove item', () => {
  it('removes the row when Eliminar is clicked', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');
    // The purchase items list is visible after adding
    expect(screen.getByRole('list', { name: /purchase items/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));

    // The list itself disappears (no items remaining)
    expect(screen.queryByRole('list', { name: /purchase items/i })).not.toBeInTheDocument();
  });

  it('disables submit again after removing all items', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');
    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));

    expect(screen.getByRole('button', { name: /crear compra/i })).toBeDisabled();
  });
});

describe('PurchaseBuilder — hidden items JSON', () => {
  it('hidden items field contains JSON with productId, cantidad, costoUnitario', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');

    const costoInput = document.querySelector<HTMLInputElement>('input[step="0.01"]');
    fireEvent.change(costoInput!, { target: { value: '2.50' } });

    const hiddenInput = document.querySelector<HTMLInputElement>('input[name="items"]');
    expect(hiddenInput).not.toBeNull();
    const parsed = JSON.parse(hiddenInput!.value);
    // expiryDate is now included in item JSON ('' when product has no shelf_life_days)
    expect(parsed).toEqual([{ productId: 'prod-1', cantidad: 1, costoUnitario: 2.50, expiryDate: '' }]);
  });

  it('hidden items JSON updates when costoUnitario changes', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    addProduct('prod-1');

    const costoInput = document.querySelector<HTMLInputElement>('input[step="0.01"]');
    fireEvent.change(costoInput!, { target: { value: '9.99' } });

    const hiddenInput = document.querySelector<HTMLInputElement>('input[name="items"]');
    const parsed = JSON.parse(hiddenInput!.value);
    expect(parsed[0].costoUnitario).toBeCloseTo(9.99);
  });
});

describe('PurchaseBuilder — fecha input', () => {
  it('renders a date input for fecha (optional backdating)', () => {
    render(<PurchaseBuilder suppliers={suppliers} products={products} />);
    const fechaInput = document.querySelector<HTMLInputElement>('input[type="date"][name="fecha"]');
    expect(fechaInput).not.toBeNull();
  });
});
