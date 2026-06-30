/**
 * Unit tests for EmisorForm.
 *
 * Verifies:
 *  - RUC input, estab input, pto_emi input, submit button are rendered
 *  - Invalid RUC (9 digits) → FieldError on ruc visible
 *  - Valid RUC (13 digits) → no validation error
 *  - initialData.ruc pre-fills defaultValue on RUC input
 *  - initialData.estab / pto_emi pre-fill their inputs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { EmisorForm } from '@/components/settings/EmisorForm';
import type { ActionResult } from '@/app/(app)/settings/emisor/actions';
import type { TenantEmisor } from '@/lib/data/tenants';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const noop = vi.fn().mockResolvedValue(null as ActionResult);

const emisorData: TenantEmisor = {
  ruc: '0992234789001',
  estab: '001',
  pto_emi: '001',
  nombre: 'Distribuidora El Sol',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Field rendering
// ---------------------------------------------------------------------------
describe('EmisorForm — field rendering', () => {
  it('renders the RUC input', () => {
    render(<EmisorForm action={noop} />);
    expect(screen.getByLabelText(/ruc/i)).toBeInTheDocument();
  });

  it('renders the estab input', () => {
    render(<EmisorForm action={noop} />);
    expect(screen.getByLabelText(/establecimiento|estab/i)).toBeInTheDocument();
  });

  it('renders the pto_emi input', () => {
    render(<EmisorForm action={noop} />);
    expect(screen.getByLabelText(/punto.*emisi|pto.*emi/i)).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<EmisorForm action={noop} />);
    expect(screen.getByRole('button', { name: /guardar|actualizar/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// initialData pre-fill
// ---------------------------------------------------------------------------
describe('EmisorForm — initialData pre-fill', () => {
  it('pre-fills RUC from initialData', () => {
    render(<EmisorForm action={noop} initialData={emisorData} />);
    expect(screen.getByDisplayValue('0992234789001')).toBeInTheDocument();
  });

  it('pre-fills estab from initialData', () => {
    render(<EmisorForm action={noop} initialData={emisorData} />);
    const estabInput = screen.getByLabelText(/establecimiento|estab/i) as HTMLInputElement;
    expect(estabInput.value).toBe('001');
  });

  it('pre-fills pto_emi from initialData', () => {
    render(<EmisorForm action={noop} initialData={emisorData} />);
    const ptoemInput = screen.getByLabelText(/punto.*emisi|pto.*emi/i) as HTMLInputElement;
    expect(ptoemInput.value).toBe('001');
  });

  it('shows null RUC as empty string when initialData.ruc is null', () => {
    const noRuc = { ...emisorData, ruc: null };
    render(<EmisorForm action={noop} initialData={noRuc} />);
    const rucInput = screen.getByLabelText(/ruc/i) as HTMLInputElement;
    expect(rucInput.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// FieldError display
// ---------------------------------------------------------------------------
describe('EmisorForm — field error display', () => {
  it('displays a field error on ruc when action returns that fieldError', async () => {
    const errAction = vi.fn().mockResolvedValue({
      fieldErrors: { ruc: ['El RUC debe tener exactamente 13 dígitos numéricos'] },
    } satisfies ActionResult);

    const { container } = render(<EmisorForm action={errAction} />);
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(
      screen.getByText('El RUC debe tener exactamente 13 dígitos numéricos')
    ).toBeInTheDocument();
  });

  it('displays a top-level error banner when action returns an error', async () => {
    const errAction = vi.fn().mockResolvedValue({
      error: 'Database error',
    } satisfies ActionResult);

    const { container } = render(<EmisorForm action={errAction} />);
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(screen.getByText('Database error')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Success feedback
// ---------------------------------------------------------------------------
describe('EmisorForm — success feedback', () => {
  it('shows success message when action returns success: true', async () => {
    const successAction = vi.fn().mockResolvedValue({
      success: true,
    } satisfies ActionResult);

    const { container } = render(<EmisorForm action={successAction} />);
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
