'use client';

/**
 * OrderBuilder — stateful Client component for creating new orders.
 *
 * State:
 *   selectedStoreId  — controls the store <select>
 *   lineItems[]      — [{productId, cantidad}] — one entry per product (deduped by productId)
 *
 * Behaviour:
 *   - Adding a product that is already in lineItems MERGES by summing cantidad.
 *   - Cantidad steppers are touch-target sized (≥44px).
 *   - Preview total is display-only (derived from product.precio_unitario × cantidad).
 *     Authoritative total comes from the DB after order creation.
 *   - Submit is disabled while pending OR when lineItems is empty.
 *   - Line items are serialised to a hidden JSON `items` FormData field.
 *   - insufficientStock errors map productId → nombre from the `products` prop.
 *
 * Uses useActionState(createOrderAction) — mirrors ProductForm / StoreForm pattern.
 */

import { useActionState, useState, useMemo } from 'react';
import type { Store } from '@/lib/data/stores';
import type { Product } from '@/lib/data/products';
import { createOrderAction } from '@/app/(app)/orders/actions';
import type { ActionResult } from '@/app/(app)/orders/actions';
import { formatCurrency } from '@/lib/format';

interface LineItem {
  productId: string;
  cantidad: number;
}

interface Props {
  stores: Store[];
  products: Product[];
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

export function OrderBuilder({ stores, products }: Props) {
  const [state, dispatch, isPending] = useActionState<ActionResult, FormData>(
    createOrderAction,
    null
  );
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  /** Fast product lookup by id. */
  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  /** Display-only estimated total from current client prices. */
  const previewTotal = useMemo(
    () =>
      lineItems.reduce((sum, item) => {
        const product = productMap.get(item.productId);
        return sum + (product ? product.precio_unitario * item.cantidad : 0);
      }, 0),
    [lineItems, productMap]
  );

  /**
   * Resolved insufficient-stock error for the current action state.
   * Precomputed here (not in JSX) to avoid IIFE patterns that can mis-render.
   */
  const stockError = state?.insufficientStock
    ? (() => {
        const { productId, available, requested } = state.insufficientStock;
        const product = productMap.get(productId);
        return {
          name: product?.nombre ?? productId,
          available,
          requested,
        };
      })()
    : null;

  function addItem() {
    if (!selectedProductId) return;
    setLineItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === selectedProductId);
      if (existingIdx >= 0) {
        // Merge: sum cantidad rather than creating a duplicate row.
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          cantidad: updated[existingIdx].cantidad + 1,
        };
        return updated;
      }
      return [...prev, { productId: selectedProductId, cantidad: 1 }];
    });
    setSelectedProductId('');
  }

  function removeItem(productId: string) {
    setLineItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function updateCantidad(productId: string, cantidad: number) {
    if (cantidad < 1) return;
    setLineItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, cantidad } : i))
    );
  }

  return (
    <form action={dispatch} className="space-y-6">
      {/* Hidden JSON field — line items serialised for the Server Action. */}
      <input type="hidden" name="items" value={JSON.stringify(lineItems)} />

      {/* ── Order header fields ──────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-brand" />
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-brand uppercase tracking-wide">
            Detalles del pedido
          </h2>

          {/* Store select */}
          <div className="space-y-1">
            <label htmlFor="storeId" className="block text-sm font-medium text-gray-700">
              Tienda *
            </label>
            <select
              id="storeId"
              name="storeId"
              required
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className={`${inputClass} min-h-[44px]`}
            >
              <option value="">Selecciona una tienda…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            <FieldError messages={state?.fieldErrors?.storeId} />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label htmlFor="notas" className="block text-sm font-medium text-gray-700">
              Notas
            </label>
            <textarea
              id="notas"
              name="notas"
              rows={2}
              className={inputClass}
              placeholder="Notas opcionales…"
            />
          </div>
        </div>
      </div>

      {/* ── Line items ───────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-info" />
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-info uppercase tracking-wide">
            Productos
          </h2>

          {/* Product selector + Add button */}
          <div className="flex gap-2">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className={`flex-1 ${inputClass} min-h-[44px]`}
              aria-label="Seleccionar un producto para agregar"
            >
              <option value="">Selecciona un producto…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} — {formatCurrency(p.precio_unitario)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addItem}
              disabled={!selectedProductId}
              className="btn-primary disabled:opacity-50"
            >
              Agregar
            </button>
          </div>

          <FieldError messages={state?.fieldErrors?.items} />

          {/* Ordered line items */}
          {lineItems.length > 0 && (
            <>
              <ul className="space-y-2" aria-label="Order items">
                {lineItems.map((item) => {
                  const product = productMap.get(item.productId);
                  const productName = product?.nombre ?? item.productId;
                  return (
                    <li
                      key={item.productId}
                      className="flex items-center gap-2 rounded-xl border border-gray-100 bg-cream p-3"
                    >
                      <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                        {productName}
                      </span>

                      {/* Quantity stepper */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateCantidad(item.productId, item.cantidad - 1)}
                          disabled={item.cantidad <= 1}
                          className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-brand"
                          aria-label={`Disminuir cantidad de ${productName}`}
                        >
                          −
                        </button>
                        <span
                          className="w-8 text-center text-sm font-medium"
                          aria-label={`Cantidad: ${item.cantidad}`}
                        >
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCantidad(item.productId, item.cantidad + 1)}
                          className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand"
                          aria-label={`Aumentar cantidad de ${productName}`}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        className="btn-danger px-3 py-2.5 text-sm"
                      >
                        Eliminar
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Display-only preview total */}
              <div className="flex justify-end pt-2 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Total estimado:{' '}
                  <span
                    className="font-bold text-info"
                    aria-label="Total estimado"
                  >
                    {formatCurrency(previewTotal)}
                  </span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Insufficient stock error ─────────────────────────────── */}
      {stockError && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-danger"
        >
          Stock insuficiente para &ldquo;{stockError.name}&rdquo;: disponible {stockError.available}, solicitado {stockError.requested}.
        </p>
      )}

      {/* ── Generic error ────────────────────────────────────────── */}
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
        disabled={isPending || lineItems.length === 0}
        className="btn-primary w-full"
      >
        {isPending ? 'Creando…' : 'Crear pedido'}
      </button>
    </form>
  );
}
