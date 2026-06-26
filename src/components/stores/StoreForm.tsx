'use client';

/**
 * StoreForm — Client Component.
 *
 * Handles store creation and editing via useActionState.
 * Accepts the server action as a prop so the form is independently testable.
 *
 * Fields:
 *   nombre (required)
 *   contacto, direccion, telefono (optional)
 *
 * Touch targets are ≥44px. Submit is disabled while the action is pending.
 */

import { useActionState } from 'react';
import type { ActionResult } from '@/app/(app)/stores/actions';
import type { Store } from '@/lib/data/stores';

interface Props {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  initialData?: Store;
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

export function StoreForm({ action, initialData }: Props) {
  const [state, dispatch, isPending] = useActionState(action, null);
  const isEdit = !!initialData;

  return (
    <form action={dispatch} className="space-y-6">
      {initialData && (
        <input type="hidden" name="id" value={initialData.id} />
      )}

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-brand" />
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-brand uppercase tracking-wide">
            Detalles de la tienda
          </h2>

          {/* nombre */}
          <div className="space-y-1">
            <label
              htmlFor="nombre"
              className="block text-sm font-medium text-gray-700"
            >
              Nombre *
            </label>
            <input
              id="nombre"
              name="nombre"
              type="text"
              required
              defaultValue={initialData?.nombre ?? ''}
              className={inputClass}
              placeholder="Nombre de la tienda"
            />
            <FieldError messages={state?.fieldErrors?.nombre} />
          </div>

          {/* contacto */}
          <div className="space-y-1">
            <label
              htmlFor="contacto"
              className="block text-sm font-medium text-gray-700"
            >
              Contacto
            </label>
            <input
              id="contacto"
              name="contacto"
              type="text"
              defaultValue={initialData?.contacto ?? ''}
              className={inputClass}
              placeholder="Persona de contacto"
            />
            <FieldError messages={state?.fieldErrors?.contacto} />
          </div>

          {/* direccion */}
          <div className="space-y-1">
            <label
              htmlFor="direccion"
              className="block text-sm font-medium text-gray-700"
            >
              Dirección
            </label>
            <input
              id="direccion"
              name="direccion"
              type="text"
              defaultValue={initialData?.direccion ?? ''}
              className={inputClass}
              placeholder="Dirección de la tienda"
            />
            <FieldError messages={state?.fieldErrors?.direccion} />
          </div>

          {/* telefono */}
          <div className="space-y-1">
            <label
              htmlFor="telefono"
              className="block text-sm font-medium text-gray-700"
            >
              Teléfono
            </label>
            <input
              id="telefono"
              name="telefono"
              type="text"
              defaultValue={initialData?.telefono ?? ''}
              className={inputClass}
              placeholder="Número de teléfono"
            />
            <FieldError messages={state?.fieldErrors?.telefono} />
          </div>
        </div>
      </div>

      {/* ── Global error ─────────────────────────────────────────── */}
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      {/* ── Submit ───────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={isPending}
        className="btn-primary w-full"
      >
        {isPending ? 'Guardando…' : isEdit ? 'Actualizar tienda' : 'Crear tienda'}
      </button>
    </form>
  );
}
