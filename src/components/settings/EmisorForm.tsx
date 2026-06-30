'use client';

/**
 * EmisorForm — Client Component.
 *
 * Allows the tenant operator to configure their fiscal emisor data:
 *   ruc      (required — NULL ruc blocks invoice emission per REQ-4a)
 *   estab    (establishment code, default '001')
 *   pto_emi  (emission point code, default '001')
 *
 * Mirrors the StoreForm structure (useActionState, FieldError, card layout).
 * Accepts the server action as a prop so the form is independently testable.
 */

import { useActionState } from 'react';
import type { ActionResult } from '@/app/(app)/settings/emisor/actions';
import type { TenantEmisor } from '@/lib/data/tenants';

interface Props {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  initialData?: TenantEmisor | null;
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-danger">
      {messages[0]}
    </p>
  );
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent';

export function EmisorForm({ action, initialData }: Props) {
  const [state, dispatch, isPending] = useActionState(action, null);

  return (
    <form action={dispatch} className="space-y-6">
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-brand" />
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-brand uppercase tracking-wide">
            Configuración del emisor
          </h2>

          {/* ruc — required; NULL blocks invoice emission */}
          <div className="space-y-1">
            <label
              htmlFor="ruc"
              className="block text-sm font-medium text-gray-700"
            >
              RUC *
            </label>
            <input
              id="ruc"
              name="ruc"
              type="text"
              required
              defaultValue={initialData?.ruc ?? ''}
              className={inputClass}
              placeholder="13 dígitos numéricos"
            />
            <FieldError messages={state?.fieldErrors?.ruc} />
          </div>

          {/* estab */}
          <div className="space-y-1">
            <label
              htmlFor="estab"
              className="block text-sm font-medium text-gray-700"
            >
              Establecimiento (estab)
            </label>
            <input
              id="estab"
              name="estab"
              type="text"
              defaultValue={initialData?.estab ?? '001'}
              className={inputClass}
              placeholder="001"
            />
            <FieldError messages={state?.fieldErrors?.estab} />
          </div>

          {/* pto_emi */}
          <div className="space-y-1">
            <label
              htmlFor="pto_emi"
              className="block text-sm font-medium text-gray-700"
            >
              Punto de emisión (pto_emi)
            </label>
            <input
              id="pto_emi"
              name="pto_emi"
              type="text"
              defaultValue={initialData?.pto_emi ?? '001'}
              className={inputClass}
              placeholder="001"
            />
            <FieldError messages={state?.fieldErrors?.pto_emi} />
          </div>
        </div>
      </div>

      {/* Success feedback */}
      {state?.success && (
        <p
          role="status"
          className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800"
        >
          Configuración guardada correctamente.
        </p>
      )}

      {/* Global error */}
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="btn-primary w-full"
      >
        {isPending ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </form>
  );
}
