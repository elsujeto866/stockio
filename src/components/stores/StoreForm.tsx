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
    <p role="alert" className="mt-1 text-xs text-red-600">
      {messages[0]}
    </p>
  );
}

export function StoreForm({ action, initialData }: Props) {
  const [state, dispatch, isPending] = useActionState(action, null);
  const isEdit = !!initialData;

  return (
    <form action={dispatch} className="space-y-6">
      {initialData && (
        <input type="hidden" name="id" value={initialData.id} />
      )}

      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Store details
        </h2>

        {/* nombre */}
        <div className="space-y-1">
          <label
            htmlFor="nombre"
            className="block text-sm font-medium text-gray-700"
          >
            Name *
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            defaultValue={initialData?.nombre ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Store name"
          />
          <FieldError messages={state?.fieldErrors?.nombre} />
        </div>

        {/* contacto */}
        <div className="space-y-1">
          <label
            htmlFor="contacto"
            className="block text-sm font-medium text-gray-700"
          >
            Contact
          </label>
          <input
            id="contacto"
            name="contacto"
            type="text"
            defaultValue={initialData?.contacto ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Contact person"
          />
          <FieldError messages={state?.fieldErrors?.contacto} />
        </div>

        {/* direccion */}
        <div className="space-y-1">
          <label
            htmlFor="direccion"
            className="block text-sm font-medium text-gray-700"
          >
            Address
          </label>
          <input
            id="direccion"
            name="direccion"
            type="text"
            defaultValue={initialData?.direccion ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Store address"
          />
          <FieldError messages={state?.fieldErrors?.direccion} />
        </div>

        {/* telefono */}
        <div className="space-y-1">
          <label
            htmlFor="telefono"
            className="block text-sm font-medium text-gray-700"
          >
            Phone
          </label>
          <input
            id="telefono"
            name="telefono"
            type="text"
            defaultValue={initialData?.telefono ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Phone number"
          />
          <FieldError messages={state?.fieldErrors?.telefono} />
        </div>
      </div>

      {/* ── Global error ─────────────────────────────────────────── */}
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      {/* ── Submit ───────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 transition-colors min-h-[44px]"
      >
        {isPending ? 'Saving…' : isEdit ? 'Update store' : 'Create store'}
      </button>
    </form>
  );
}
