/**
 * Unit tests for StoreForm.
 *
 * Verifies:
 *  - nombre, contacto, direccion, telefono fields are rendered
 *  - Create mode shows "Create store" submit button
 *  - Edit mode shows "Update store" submit button and pre-fills nombre
 *  - fieldErrors from state are displayed next to the relevant input
 *  - Generic error banner is shown when state has an error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { StoreForm } from '@/components/stores/StoreForm';
import type { ActionResult } from '@/app/(app)/stores/actions';
import type { Store } from '@/lib/data/stores';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const noop = vi.fn().mockResolvedValue(null as ActionResult);

const store: Store = {
  id: 'store-1',
  tenant_id: 't-1',
  nombre: 'Almacén Central',
  contacto: 'Juan Pérez',
  direccion: 'Av. Corrientes 1234',
  telefono: '+54 11 1234-5678',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  payment_terms_days: 30,
  // WU5 fiscal fields
  tipo_identificacion: '07',
  numero_identificacion: null,
  razon_social_comprobante: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Field rendering
// ---------------------------------------------------------------------------
describe('StoreForm — field rendering', () => {
  it('renders the nombre field', () => {
    render(<StoreForm action={noop} />);
    expect(screen.getByLabelText(/^nombre/i)).toBeInTheDocument();
  });

  it('renders the contacto field', () => {
    render(<StoreForm action={noop} />);
    expect(screen.getByLabelText(/contact/i)).toBeInTheDocument();
  });

  it('renders the direccion field', () => {
    render(<StoreForm action={noop} />);
    expect(screen.getByLabelText(/direcci/i)).toBeInTheDocument();
  });

  it('renders the telefono field', () => {
    render(<StoreForm action={noop} />);
    expect(screen.getByLabelText(/tel/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mode: create vs edit
// ---------------------------------------------------------------------------
describe('StoreForm — create vs edit mode', () => {
  it('shows "Create store" submit label in create mode', () => {
    render(<StoreForm action={noop} />);
    expect(screen.getByRole('button', { name: /crear tienda/i })).toBeInTheDocument();
  });

  it('shows "Update store" submit label in edit mode', () => {
    render(<StoreForm action={noop} initialData={store} />);
    expect(screen.getByRole('button', { name: /actualizar tienda/i })).toBeInTheDocument();
  });

  it('pre-fills the nombre field from initialData', () => {
    render(<StoreForm action={noop} initialData={store} />);
    expect(screen.getByDisplayValue('Almacén Central')).toBeInTheDocument();
  });

  it('pre-fills contacto from initialData', () => {
    render(<StoreForm action={noop} initialData={store} />);
    expect(screen.getByDisplayValue('Juan Pérez')).toBeInTheDocument();
  });

  it('renders the payment_terms_days field', () => {
    render(<StoreForm action={noop} />);
    // label contains "días" or "plazo" (case-insensitive)
    expect(screen.getByLabelText(/d[ií]as|plazo/i)).toBeInTheDocument();
  });

  it('pre-fills payment_terms_days from initialData', () => {
    const storeWith45Days = { ...store, payment_terms_days: 45 };
    render(<StoreForm action={noop} initialData={storeWith45Days} />);
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
  });

  it('defaults payment_terms_days to 30 in create mode', () => {
    render(<StoreForm action={noop} />);
    const input = screen.getByLabelText(/d[ií]as|plazo/i) as HTMLInputElement;
    expect(input.value).toBe('30');
  });
});

// ---------------------------------------------------------------------------
// WU7 — Fiscal card
//
// RED until StoreForm is updated with the "Datos fiscales (comprobante)" card.
// ---------------------------------------------------------------------------
describe('StoreForm — fiscal card (WU7)', () => {
  it('renders "Datos fiscales (comprobante)" section heading', () => {
    render(<StoreForm action={noop} />);
    expect(screen.getByText(/datos fiscales/i)).toBeInTheDocument();
  });

  it('renders tipo_identificacion select with 5 options (04, 05, 06, 07, 08)', () => {
    render(<StoreForm action={noop} />);
    const select = screen.getByRole('combobox', { name: /tipo.*identificaci/i });
    expect(select).toBeInTheDocument();
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(expect.arrayContaining(['04', '05', '06', '07', '08']));
    expect(options).toHaveLength(5);
  });

  it('renders numero_identificacion input', () => {
    render(<StoreForm action={noop} />);
    expect(screen.getByLabelText(/n[uú]mero.*identificaci/i)).toBeInTheDocument();
  });

  it('renders razon_social_comprobante input', () => {
    render(<StoreForm action={noop} />);
    expect(screen.getByLabelText(/raz[oó]n social/i)).toBeInTheDocument();
  });

  it('pre-fills tipo_identificacion from initialData', () => {
    const storeWithRuc = { ...store, tipo_identificacion: '04' };
    render(<StoreForm action={noop} initialData={storeWithRuc} />);
    const select = screen.getByRole('combobox', { name: /tipo.*identificaci/i }) as HTMLSelectElement;
    expect(select.value).toBe('04');
  });

  it('pre-fills numero_identificacion from initialData', () => {
    const storeWithNum = { ...store, numero_identificacion: '1713175071' };
    render(<StoreForm action={noop} initialData={storeWithNum} />);
    expect(screen.getByDisplayValue('1713175071')).toBeInTheDocument();
  });

  it('pre-fills razon_social_comprobante from initialData', () => {
    const storeWithRazon = { ...store, razon_social_comprobante: 'Tienda Los Andes' };
    render(<StoreForm action={noop} initialData={storeWithRazon} />);
    expect(screen.getByDisplayValue('Tienda Los Andes')).toBeInTheDocument();
  });

  it('displays a field error on numero_identificacion when action returns that fieldError', async () => {
    const errAction = vi.fn().mockResolvedValue({
      fieldErrors: { numero_identificacion: ['Cédula inválida'] },
    } satisfies ActionResult);

    const { container } = render(<StoreForm action={errAction} />);
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(screen.getByText('Cédula inválida')).toBeInTheDocument();
  });

  it('displays a field error on razon_social_comprobante when action returns that fieldError', async () => {
    const errAction = vi.fn().mockResolvedValue({
      fieldErrors: { razon_social_comprobante: ['Razón social requerida'] },
    } satisfies ActionResult);

    const { container } = render(<StoreForm action={errAction} />);
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(screen.getByText('Razón social requerida')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------
describe('StoreForm — error display', () => {
  it('displays a field error under nombre when action returns fieldErrors', async () => {
    const errAction = vi.fn().mockResolvedValue({
      fieldErrors: { nombre: ['El nombre es obligatorio'] },
    } satisfies ActionResult);

    const { container } = render(<StoreForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument();
  });

  it('displays a top-level error banner when action returns an error', async () => {
    const errAction = vi.fn().mockResolvedValue({
      error: 'Something went wrong',
    } satisfies ActionResult);

    const { container } = render(<StoreForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
