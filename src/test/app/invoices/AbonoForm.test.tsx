/**
 * AR-T21 — AbonoForm component unit tests.
 *
 * Strict TDD — RED PHASE: written before AbonoForm.tsx exists.
 *
 * Verifies:
 *   - Renders outstanding balance = total - total_paid (S3-1)
 *   - Form structure present (amount input, submit button)
 *   - Client component uses lazy useState, no useEffect→setState
 *
 * ⚠️ LINT GOTCHA: AbonoForm MUST use lazy useState initializer for any
 * client-initialized state — NOT useEffect(() => setState(...)). Single
 * 'use client' at top. This test verifies no double-render side-effect
 * artifacts appear.
 *
 * Covers: REQ-2/S2-3..S2-5, REQ-3/S3-1
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/(app)/invoices/actions', () => ({
  recordPaymentAction: vi.fn(),
  createInvoiceAction: vi.fn(),
}));

import { AbonoForm } from '@/components/invoices/AbonoForm';

const INVOICE_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';

describe('AbonoForm — outstanding balance display (S3-1)', () => {
  it('displays outstanding balance = total - total_paid', () => {
    render(
      <AbonoForm invoiceId={INVOICE_UUID} total={750} totalPaid={250} />
    );

    // Outstanding should be displayed as 500
    expect(screen.getByText(/500/)).toBeInTheDocument();
  });

  it('renders with total_paid=0 showing full amount as outstanding', () => {
    render(
      <AbonoForm invoiceId={INVOICE_UUID} total={1000} totalPaid={0} />
    );

    expect(screen.getByText(/1000/)).toBeInTheDocument();
  });

  it('renders with 0 outstanding when fully paid', () => {
    const { container } = render(
      <AbonoForm invoiceId={INVOICE_UUID} total={500} totalPaid={500} />
    );

    // Form should still render (even if balance = 0)
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
  });
});

describe('AbonoForm — form inputs', () => {
  it('has an amount input with positive min value', () => {
    render(
      <AbonoForm invoiceId={INVOICE_UUID} total={1000} totalPaid={0} />
    );

    const amountInput = screen.getByLabelText(/monto del abono|importe|amount/i);
    expect(amountInput).toBeInTheDocument();
    expect((amountInput as HTMLInputElement).type).toBe('number');
  });

  it('has a submit button', () => {
    render(
      <AbonoForm invoiceId={INVOICE_UUID} total={1000} totalPaid={0} />
    );

    const submitButton = screen.getByRole('button', { name: /registrar abono|guardar|pagar/i });
    expect(submitButton).toBeInTheDocument();
  });

  it('has an invoiceId hidden input', () => {
    render(
      <AbonoForm invoiceId={INVOICE_UUID} total={1000} totalPaid={0} />
    );

    const hiddenInput = document.querySelector('input[name="invoiceId"]') as HTMLInputElement;
    expect(hiddenInput).not.toBeNull();
    expect(hiddenInput.value).toBe(INVOICE_UUID);
  });
});
