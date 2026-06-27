'use client';

/**
 * PurchaseBuilder — stateful Client component for recording purchase receipts.
 *
 * Mirrors OrderBuilder but with key divergences:
 *   - Supplier <select name="supplierId"> instead of store select
 *   - Line items track costoUnitario per row (user-entered, not catalog price)
 *   - previewTotal = Σ(costoUnitario × cantidad) — NOT product.precio_unitario
 *   - Optional <input type="date" name="fecha"> for backdated receipts
 *   - Hidden items field: [{productId, cantidad, costoUnitario}]
 *   - Default new line costoUnitario = 0 (user must fill)
 *   - NO insufficient-stock path (purchases never fail on stock level)
 *
 * State:
 *   lineItems[]  — [{productId, cantidad, costoUnitario}]
 *
 * Uses useActionState(createPurchaseAction) — mirrors OrderBuilder pattern.
 */

import { useActionState, useState, useMemo } from 'react';
import type { Supplier } from '@/lib/data/suppliers';
import type { Product } from '@/lib/data/products';
import { createPurchaseAction } from '@/app/(app)/purchases/actions';
import type { ActionResult } from '@/app/(app)/purchases/actions';
import { formatCurrency } from '@/lib/format';

interface LineItem {
  productId: string;
  cantidad: number;
  costoUnitario: number;
}

interface Props {
  suppliers: Supplier[];
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

export function PurchaseBuilder({ suppliers, products }: Props) {
  const [state, dispatch, isPending] = useActionState<ActionResult, FormData>(
    createPurchaseAction,
    null
  );
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  /** Fast product lookup by id. */
  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  /** Active suppliers only — deactivated suppliers hidden from dropdown (REQ-S2). */
  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.activo),
    [suppliers]
  );

  /** Display-only estimated total: Σ(costoUnitario × cantidad). */
  const previewTotal = useMemo(
    () =>
      lineItems.reduce(
        (sum, item) => sum + item.costoUnitario * item.cantidad,
        0
      ),
    [lineItems]
  );

  function addItem() {
    if (!selectedProductId) return;
    setLineItems((prev) => {
      // Merge duplicate products into a single row: re-adding the same product
      // increments its cantidad and keeps the already-entered costo_unitario.
      const existingIdx = prev.findIndex((i) => i.productId === selectedProductId);
      if (existingIdx >= 0) {
        // Same product already in the list — bump cantidad, preserve costo
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          cantidad: updated[existingIdx].cantidad + 1,
        };
        return updated;
      }
      return [...prev, { productId: selectedProductId, cantidad: 1, costoUnitario: 0 }];
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

  function updateCosto(productId: string, value: string) {
    const costoUnitario = parseFloat(value) || 0;
    setLineItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, costoUnitario } : i))
    );
  }

  return (
    <form action={dispatch} className="space-y-6">
      {/* Hidden JSON field — line items serialised for the Server Action. */}
      <input type="hidden" name="items" value={JSON.stringify(lineItems)} />

      {/* ── Purchase header fields ─────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-brand" />
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-brand uppercase tracking-wide">
            Datos de la compra
          </h2>

          {/* Supplier select */}
          <div className="space-y-1">
            <label htmlFor="supplierId" className="block text-sm font-medium text-gray-700">
              Proveedor *
            </label>
            <select
              id="supplierId"
              name="supplierId"
              required
              className={`${inputClass} min-h-[44px]`}
            >
              <option value="">Selecciona un proveedor…</option>
              {activeSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            <FieldError messages={state?.fieldErrors?.supplierId} />
          </div>

          {/* Fecha (optional — backdated receipts) */}
          <div className="space-y-1">
            <label htmlFor="fecha" className="block text-sm font-medium text-gray-700">
              Fecha de recepción
            </label>
            <input
              id="fecha"
              type="date"
              name="fecha"
              className={inputClass}
            />
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

      {/* ── Line items ───────────────────────────────────────────────── */}
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
                  {p.nombre}
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

          {/* Line item rows */}
          {lineItems.length > 0 && (
            <>
              <ul className="space-y-2" aria-label="Purchase items">
                {lineItems.map((item) => {
                  const product = productMap.get(item.productId);
                  const productName = product?.nombre ?? item.productId;
                  return (
                    <li
                      key={item.productId}
                      className="flex items-center gap-2 rounded-xl border border-gray-100 bg-cream p-3"
                    >
                      <span className="flex-1 text-sm font-medium text-gray-900 truncate min-w-0">
                        {productName}
                      </span>

                      {/* Costo unitario input */}
                      <div className="flex flex-col items-start gap-0.5">
                        <label
                          htmlFor={`costo-${item.productId}`}
                          className="text-xs text-gray-500"
                        >
                          Costo
                        </label>
                        <input
                          id={`costo-${item.productId}`}
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.costoUnitario}
                          onChange={(e) => updateCosto(item.productId, e.target.value)}
                          className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                          aria-label={`Costo unitario de ${productName}`}
                        />
                      </div>

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

      {/* ── Generic error ────────────────────────────────────────────── */}
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      {/* ── Submit ───────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={isPending || lineItems.length === 0}
        className="btn-primary w-full"
      >
        {isPending ? 'Registrando…' : 'Crear compra'}
      </button>
    </form>
  );
}
