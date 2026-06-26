'use client';

/**
 * ProductForm — Client Component.
 *
 * Handles product creation and editing via useActionState.
 * Accepts the server action as a prop so the form is independently testable.
 *
 * Fields are grouped:
 *   Group A: nombre / sku / categoria / unidad_medida (identity)
 *   Group B: precio_unitario / stock_actual / stock_minimo (numeric)
 *
 * Touch targets are ≥44px. Submit is disabled while the action is pending.
 */

import { useActionState } from 'react';
import type { ActionResult } from '@/app/(app)/products/actions';
import type { Product } from '@/lib/data/products';

interface Props {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  initialData?: Product;
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {messages[0]}
    </p>
  );
}

export function ProductForm({ action, initialData }: Props) {
  const [state, dispatch, isPending] = useActionState(action, null);
  const isEdit = !!initialData;

  return (
    <form action={dispatch} className="space-y-6">
      {initialData && (
        <input type="hidden" name="id" value={initialData.id} />
      )}

      {/* ── Group A: identity fields ────────────────────────────── */}
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Detalles del producto
        </h2>

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
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Nombre del producto"
          />
          <FieldError messages={state?.fieldErrors?.nombre} />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="sku"
            className="block text-sm font-medium text-gray-700"
          >
            SKU / Código
          </label>
          <input
            id="sku"
            name="sku"
            type="text"
            defaultValue={initialData?.sku ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g. OL-001"
          />
          <FieldError messages={state?.fieldErrors?.sku} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label
              htmlFor="categoria"
              className="block text-sm font-medium text-gray-700"
            >
              Categoría
            </label>
            <input
              id="categoria"
              name="categoria"
              type="text"
              defaultValue={initialData?.categoria ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="p. ej. Alimentos"
            />
            <FieldError messages={state?.fieldErrors?.categoria} />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="unidad_medida"
              className="block text-sm font-medium text-gray-700"
            >
              Unidad de medida
            </label>
            <input
              id="unidad_medida"
              name="unidad_medida"
              type="text"
              defaultValue={initialData?.unidad_medida ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. kg"
            />
            <FieldError messages={state?.fieldErrors?.unidad_medida} />
          </div>
        </div>
      </div>

      {/* ── Group B: numeric fields ─────────────────────────────── */}
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Precio y stock
        </h2>

        <div className="space-y-1">
          <label
            htmlFor="precio_unitario"
            className="block text-sm font-medium text-gray-700"
          >
            Precio unitario *
          </label>
          <input
            id="precio_unitario"
            name="precio_unitario"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={initialData?.precio_unitario ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.00"
          />
          <FieldError messages={state?.fieldErrors?.precio_unitario} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label
              htmlFor="stock_actual"
              className="block text-sm font-medium text-gray-700"
            >
              Stock actual *
            </label>
            <input
              id="stock_actual"
              name="stock_actual"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={initialData?.stock_actual ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0"
            />
            <FieldError messages={state?.fieldErrors?.stock_actual} />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="stock_minimo"
              className="block text-sm font-medium text-gray-700"
            >
              Stock mínimo *
            </label>
            <input
              id="stock_minimo"
              name="stock_minimo"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={initialData?.stock_minimo ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0"
            />
            <FieldError messages={state?.fieldErrors?.stock_minimo} />
          </div>
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
        {isPending ? 'Guardando…' : isEdit ? 'Actualizar producto' : 'Crear producto'}
      </button>
    </form>
  );
}
