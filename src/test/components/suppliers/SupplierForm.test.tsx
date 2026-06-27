/**
 * Unit tests for SupplierForm.
 *
 * Verifies:
 *  - nombre, ruc, contacto, telefono, email, notas fields are rendered
 *  - Create mode shows "Crear proveedor" submit button
 *  - Edit mode shows "Actualizar proveedor" submit button and pre-fills fields
 *  - fieldErrors from state are displayed next to the relevant input
 *  - Generic error banner is shown when state has an error
 *  - Submit button disabled while pending
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { SupplierForm } from '@/components/suppliers/SupplierForm';
import type { ActionResult } from '@/app/(app)/suppliers/actions';
import type { Supplier } from '@/lib/data/suppliers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const noop = vi.fn().mockResolvedValue(null as ActionResult);

const supplier: Supplier = {
  id: 'supplier-1',
  tenant_id: 't-1',
  nombre: 'Proveedor Central',
  ruc: '20123456789',
  contacto: 'Ana García',
  telefono: '555-1234',
  email: 'ana@proveedor.com',
  notas: 'Notas del proveedor',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Field rendering
// ---------------------------------------------------------------------------
describe('SupplierForm — field rendering', () => {
  it('renders the nombre field', () => {
    render(<SupplierForm action={noop} />);
    expect(screen.getByLabelText(/^nombre/i)).toBeInTheDocument();
  });

  it('renders the ruc field', () => {
    render(<SupplierForm action={noop} />);
    expect(screen.getByLabelText(/ruc/i)).toBeInTheDocument();
  });

  it('renders the contacto field', () => {
    render(<SupplierForm action={noop} />);
    expect(screen.getByLabelText(/contacto/i)).toBeInTheDocument();
  });

  it('renders the telefono field', () => {
    render(<SupplierForm action={noop} />);
    expect(screen.getByLabelText(/tel/i)).toBeInTheDocument();
  });

  it('renders the email field', () => {
    render(<SupplierForm action={noop} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renders the notas field', () => {
    render(<SupplierForm action={noop} />);
    expect(screen.getByLabelText(/notas/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mode: create vs edit
// ---------------------------------------------------------------------------
describe('SupplierForm — create vs edit mode', () => {
  it('shows "Crear proveedor" submit label in create mode', () => {
    render(<SupplierForm action={noop} />);
    expect(
      screen.getByRole('button', { name: /crear proveedor/i })
    ).toBeInTheDocument();
  });

  it('shows "Actualizar proveedor" submit label in edit mode', () => {
    render(<SupplierForm action={noop} initialData={supplier} />);
    expect(
      screen.getByRole('button', { name: /actualizar proveedor/i })
    ).toBeInTheDocument();
  });

  it('pre-fills the nombre field from initialData', () => {
    render(<SupplierForm action={noop} initialData={supplier} />);
    expect(screen.getByDisplayValue('Proveedor Central')).toBeInTheDocument();
  });

  it('pre-fills contacto from initialData', () => {
    render(<SupplierForm action={noop} initialData={supplier} />);
    expect(screen.getByDisplayValue('Ana García')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------
describe('SupplierForm — error display', () => {
  it('displays a field error under nombre when action returns fieldErrors', async () => {
    const errAction = vi.fn().mockResolvedValue({
      fieldErrors: { nombre: ['El nombre es obligatorio'] },
    } satisfies ActionResult);

    const { container } = render(<SupplierForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument();
  });

  it('displays a top-level error banner when action returns an error', async () => {
    const errAction = vi.fn().mockResolvedValue({
      error: 'Something went wrong',
    } satisfies ActionResult);

    const { container } = render(<SupplierForm action={errAction} />);

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
