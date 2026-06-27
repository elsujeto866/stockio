'use client';

/**
 * CancelPurchaseButton — client-side cancel form with error UX.
 *
 * Uses useActionState(cancelPurchaseAction) so domain errors
 * (negativeStock, generic) can be surfaced to the user without a page reload.
 *
 * Rendered inside the server component PurchaseDetail — the rest of the detail
 * page remains a server component.
 */

import { useActionState } from 'react';
import { cancelPurchaseAction } from '@/app/(app)/purchases/actions';
import type { ActionResult } from '@/app/(app)/purchases/actions';

interface Props {
  purchaseId: string;
}

export function CancelPurchaseButton({ purchaseId }: Props) {
  const [state, dispatch, isPending] = useActionState<ActionResult, FormData>(
    cancelPurchaseAction,
    null
  );

  return (
    <div className="space-y-2">
      <form action={dispatch}>
        <input type="hidden" name="id" value={purchaseId} />
        <button
          type="submit"
          disabled={isPending}
          className="btn-danger disabled:opacity-50"
        >
          {isPending ? 'Cancelando…' : 'Cancelar compra'}
        </button>
      </form>

      {/* Negative-stock domain error */}
      {state?.negativeStock && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-danger"
        >
          No se puede cancelar: el producto{' '}
          <span className="font-mono text-xs">{state.negativeStock.productId}</span>{' '}
          quedaría en stock negativo (actual:{' '}
          <strong>{state.negativeStock.current}</strong>, compra:{' '}
          <strong>{state.negativeStock.cantidad}</strong>).
        </p>
      )}

      {/* Generic error */}
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-danger"
        >
          {state.error}
        </p>
      )}
    </div>
  );
}
