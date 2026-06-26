'use client';

/**
 * GenerateInvoiceButton — client component.
 *
 * Uses useActionState(createInvoiceAction, null) so that error responses
 * (cancelled order, duplicate invoice, not found) are surfaced inline
 * rather than silently dropped.
 *
 * On success, createInvoiceAction redirects to /invoices/[id], so the
 * happy path is unchanged.
 */

import { useActionState } from 'react';
import { createInvoiceAction } from '@/app/(app)/invoices/actions';
import type { ActionResult } from '@/app/(app)/invoices/actions';

interface Props {
  orderId: string;
}

export function GenerateInvoiceButton({ orderId }: Props) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    createInvoiceAction,
    null
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="orderId" value={orderId} />
      {state?.error && (
        <p role="alert" className="text-sm text-danger mb-2">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        className="btn-primary"
      >
        Generar factura
      </button>
    </form>
  );
}
