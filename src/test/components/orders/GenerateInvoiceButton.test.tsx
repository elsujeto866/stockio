/**
 * Unit tests for GenerateInvoiceButton (client component).
 *
 * Verifies:
 *  - Renders a "Generate invoice" button in the initial state.
 *  - Does NOT show an error alert by default (null state).
 *  - Renders an error alert when useActionState returns an error state.
 *
 * useActionState is mocked so we can control the returned state without
 * needing to submit the form or interact with a real server action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock useActionState so we can control state in each test.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useActionState: vi.fn(),
  };
});

vi.mock('@/app/(app)/invoices/actions', () => ({
  createInvoiceAction: vi.fn(),
}));

import { useActionState } from 'react';
import { GenerateInvoiceButton } from '@/components/orders/GenerateInvoiceButton';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: initial state (no error, not pending).
  vi.mocked(useActionState).mockReturnValue([null, vi.fn(), false] as never);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GenerateInvoiceButton', () => {
  it('renders a Generate invoice button', () => {
    render(<GenerateInvoiceButton orderId={ORDER_UUID} />);

    expect(
      screen.getByRole('button', { name: /generate invoice/i })
    ).toBeInTheDocument();
  });

  it('does not show an error alert when state is null', () => {
    render(<GenerateInvoiceButton orderId={ORDER_UUID} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error alert when useActionState returns an error state', () => {
    vi.mocked(useActionState).mockReturnValue([
      { error: 'An invoice already exists for this order.' },
      vi.fn(),
      false,
    ] as never);

    render(<GenerateInvoiceButton orderId={ORDER_UUID} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('still renders the button even when an error is shown', () => {
    vi.mocked(useActionState).mockReturnValue([
      { error: 'This order is cancelled and cannot be invoiced.' },
      vi.fn(),
      false,
    ] as never);

    render(<GenerateInvoiceButton orderId={ORDER_UUID} />);

    expect(
      screen.getByRole('button', { name: /generate invoice/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/cancelled/i);
  });
});
