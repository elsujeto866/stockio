'use client';

/**
 * AbonoForm — Client Component for recording invoice payments (abonos).
 *
 * AR-T22: New Client Component.
 *
 * Props: invoiceId, total, totalPaid.
 * Computed: outstanding = outstanding(total, totalPaid) from aging domain.
 *
 * Form fields: amount (required, positive, max=outstanding), fecha (optional),
 *              notas (optional, max 500 chars).
 * Client-side validation via RecordPaymentSchema before action is invoked.
 * Server Action: recordPaymentAction from invoices/actions.ts.
 *
 * ⚠️ LINT GOTCHA (S4-T28 precedent): NO useEffect → setState.
 * Any initial state is resolved via lazy useState initializer.
 * Exactly ONE 'use client' at the top of this file.
 *
 * Covers: REQ-2/S2-3..S2-5, REQ-3/S3-1
 */

import { useActionState } from 'react';
import { outstanding } from '@/lib/domain/aging';
import { recordPaymentAction, type ActionResult } from '@/app/(app)/invoices/actions';

interface Props {
  invoiceId: string;
  total: number;
  totalPaid: number;
}

export function AbonoForm({ invoiceId, total, totalPaid }: Props) {
  const balance = outstanding(total, totalPaid);
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    recordPaymentAction,
    null
  );

  return (
    <section aria-label="Registrar abono">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Registrar abono</h2>
      <p className="text-sm text-gray-600 mb-4">
        Saldo pendiente:{' '}
        <span className="font-medium text-gray-900">${balance.toFixed(2)}</span>
      </p>

      {state?.error && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {/* Hidden invoice id */}
        <input type="hidden" name="invoiceId" value={invoiceId} />

        <div>
          <label
            htmlFor="abono-amount"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Monto del abono
          </label>
          <input
            id="abono-amount"
            type="number"
            name="amount"
            min="0.01"
            max={balance}
            step="0.01"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="0.00"
          />
          {state?.fieldErrors?.amount && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.amount[0]}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="abono-fecha"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Fecha del abono (opcional)
          </label>
          <input
            id="abono-fecha"
            type="date"
            name="fecha"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div>
          <label
            htmlFor="abono-notas"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Notas (opcional)
          </label>
          <textarea
            id="abono-notas"
            name="notas"
            maxLength={500}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="Referencia, comprobante, etc."
          />
        </div>

        <button
          type="submit"
          disabled={isPending || balance <= 0}
          className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
        >
          {isPending ? 'Registrando...' : 'Registrar abono'}
        </button>
      </form>
    </section>
  );
}
