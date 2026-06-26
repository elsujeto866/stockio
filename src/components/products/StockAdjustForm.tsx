'use client';

/**
 * StockAdjustForm — Client Component.
 *
 * Allows manual stock adjustments via a signed integer delta.
 *  - +/- buttons (≥ 44px touch targets) increment/decrement the delta directly
 *  - Manual input also accepted
 *  - Submit is disabled while the action is pending
 *  - StockUnderflowError is surfaced as an inline error banner
 *
 * The action is passed as a prop for testability.
 */

import { useActionState, useRef } from 'react';
import type { ActionResult } from '@/app/(app)/products/actions';
import type { Product } from '@/lib/data/products';

interface Props {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  product: Product;
}

export function StockAdjustForm({ action, product }: Props) {
  const [state, dispatch, isPending] = useActionState(action, null);
  const deltaRef = useRef<HTMLInputElement>(null);

  function increment() {
    if (deltaRef.current) {
      deltaRef.current.value = String(Number(deltaRef.current.value || 0) + 1);
    }
  }

  function decrement() {
    if (deltaRef.current) {
      deltaRef.current.value = String(Number(deltaRef.current.value || 0) - 1);
    }
  }

  return (
    <form action={dispatch} className="space-y-6">
      <input type="hidden" name="productId" value={product.id} />

      {/* Current stock info */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Stock actual</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">
          {product.stock_actual}
          {product.unidad_medida ? (
            <span className="text-base font-normal text-gray-500 ml-1">
              {product.unidad_medida}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Mínimo: {product.stock_minimo}
        </p>
      </div>

      {/* Delta control */}
      <div className="space-y-2">
        <label
          htmlFor="delta"
          className="block text-sm font-medium text-gray-700"
        >
          Ajuste
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={decrement}
            disabled={isPending}
            aria-label="Disminuir stock"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors min-h-[44px] min-w-[44px]"
          >
            −
          </button>
          <input
            id="delta"
            name="delta"
            type="number"
            step="1"
            defaultValue="0"
            ref={deltaRef}
            className="w-24 rounded-lg border border-gray-300 px-3 py-2.5 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={increment}
            disabled={isPending}
            aria-label="Aumentar stock"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white text-lg font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors min-h-[44px] min-w-[44px]"
          >
            +
          </button>
        </div>
        {state?.fieldErrors?.delta && (
          <p role="alert" className="text-xs text-red-600">
            {state.fieldErrors.delta[0]}
          </p>
        )}
      </div>

      {/* Global error */}
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 transition-colors min-h-[44px]"
      >
        {isPending ? 'Ajustando…' : 'Aplicar ajuste'}
      </button>
    </form>
  );
}
