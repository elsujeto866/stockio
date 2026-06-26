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
        <p role="alert" className="text-sm text-red-600 mb-2">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors min-h-[44px]"
      >
        Generate invoice
      </button>
    </form>
  );
}
