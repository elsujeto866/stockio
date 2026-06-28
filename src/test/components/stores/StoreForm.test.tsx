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
