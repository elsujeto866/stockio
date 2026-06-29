'use client';

/**
 * OrderBuilder — stateful Client component for creating new orders.
 *
 * State:
 *   selectedStoreId    — controls the store <select>
 *   lineItems[]        — [{productId, cantidad, saleUnit}] — deduped by (productId, saleUnit)
 *   selectedProductId  — controls the product selector
 *   pendingSaleUnit    — the sale unit chosen in the add-row selector
 *
 * Behaviour:
 *   - Adding a (productId, saleUnit) pair already in lineItems MERGES by summing cantidad.
 *   - Same product as 'unit' and 'package' yields TWO independent lines (distinct economics).
 *   - 'Paca' option is disabled when the product lacks units_per_package >= 2 or precio_paca.
 *   - Preview total uses precio_paca for package lines, precio_unitario for unit lines.
 *   - Submit is disabled while pending OR when lineItems is empty.
 *   - Line items are serialised to a hidden JSON `items` FormData field (includes saleUnit).
 *   - insufficientStock errors map productId → nombre from the `products` prop.
 *
 * Pure module-level helpers (exported for unit testing without rendering):
 *   buildDedupKey, computeLineSubtotal, isPackageAvailable
 */

import { useActionState, useState, useMemo } from 'react';
import type { Store } from '@/lib/data/stores';
import type { Product } from '@/lib/data/products';
import { createOrderAction } from '@/app/(app)/orders/actions';
import type { ActionResult } from '@/app/(app)/orders/actions';
import { formatCurrency } from '@/lib/format';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { ProductPicker } from '@/components/products/ProductPicker';

// ---------------------------------------------------------------------------
// Pure exported helpers (unit-testable without rendering)
// ---------------------------------------------------------------------------

/**
 * Returns the dedup key for a line item.
 * (productId, saleUnit) pairs are economically distinct — same product sold
 * as a unit vs. a pack has different frozen prices and different base_units.
 */
export function buildDedupKey(productId: string, saleUnit: 'unit' | 'package'): string {
  return `${productId}|${saleUnit}`;
}

/**
 * Returns the display-only client-side subtotal for a line item.
 * Package lines use precio_paca; unit lines use precio_unitario.
 * Guards null precio_paca → returns 0 (UI should have disabled 'package' anyway).
 */
export function computeLineSubtotal(
  product: Product,
  saleUnit: 'unit' | 'package',
  cantidad: number
): number {
  if (saleUnit === 'package') {
    return (product.precio_paca ?? 0) * cantidad;
  }
  return product.precio_unitario * cantidad;
}

/**
 * Returns true when a product can be sold by the pack:
 * must have units_per_package >= 2 AND a non-null precio_paca.
 */
export function isPackageAvailable(product: Product): boolean {
  return (
    product.units_per_package != null &&
    product.units_per_package >= 2 &&
    product.precio_paca != null
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItem {
  productId: string;
  cantidad: number;
  saleUnit: 'unit' | 'package';
}

interface Props {
  stores: Store[];
  products: Product[];
  /** productId → signed URL (REQ-5 S5-3). Batched by the RSC page. */
  photoUrls?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrderBuilder({ stores, products, photoUrls = {} }: Props) {
  const [state, dispatch, isPending] = useActionState<ActionResult, FormData>(
    createOrderAction,
    null
  );
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [pendingSaleUnit, setPendingSaleUnit] = useState<'unit' | 'package'>('unit');
  const [pickerOpen, setPickerOpen] = useState(false);

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
        if (!product) return sum;
        return sum + computeLineSubtotal(product, item.saleUnit, item.cantidad);
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
    const saleUnit = pendingSaleUnit;
    setLineItems((prev) => {
      const existingIdx = prev.findIndex(
        (i) => buildDedupKey(i.productId, i.saleUnit) === buildDedupKey(selectedProductId, saleUnit)
      );
      if (existingIdx >= 0) {
        // Merge: increment cantidad for the matching (productId, saleUnit) pair.
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          cantidad: updated[existingIdx].cantidad + 1,
        };
        return updated;
      }
      return [...prev, { productId: selectedProductId, cantidad: 1, saleUnit }];
    });
    setSelectedProductId('');
    setPendingSaleUnit('unit');
  }

  function removeItem(productId: string, saleUnit: 'unit' | 'package') {
    setLineItems((prev) =>
      prev.filter(
        (i) => buildDedupKey(i.productId, i.saleUnit) !== buildDedupKey(productId, saleUnit)
      )
    );
  }

  function updateCantidad(productId: string, saleUnit: 'unit' | 'package', cantidad: number) {
    if (cantidad < 1) return;
    setLineItems((prev) =>
      prev.map((i) =>
        buildDedupKey(i.productId, i.saleUnit) === buildDedupKey(productId, saleUnit)
          ? { ...i, cantidad }
          : i
      )
    );
  }

  const selectedProduct = productMap.get(selectedProductId);
  const selectedProductPackAvailable = selectedProduct
    ? isPackageAvailable(selectedProduct)
    : false;

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

          {/* Product trigger button + sale unit + Add button */}
          <div className="flex flex-wrap gap-2">
            {/* Trigger — opens ProductPicker dialog.
                Constant aria-label="Agregar producto" keeps accessible name
                stable regardless of selection state. The inline Agregar
                button below is matched by /^agregar$/i (anchored) — no
                collision. */}
            <button
              type="button"
              aria-label="Agregar producto"
              onClick={() => setPickerOpen(true)}
              className={`flex-1 ${inputClass} min-h-[44px] text-left`}
            >
              {selectedProduct ? selectedProduct.nombre : 'Selecciona un producto…'}
            </button>

            {/* Sale unit selector — shown whenever a product is selected */}
            {selectedProductId && (
              <select
                value={pendingSaleUnit}
                onChange={(e) => setPendingSaleUnit(e.target.value as 'unit' | 'package')}
                className={`${inputClass} min-h-[44px] w-36`}
                aria-label="Tipo de venta"
              >
                <option value="unit">Unidad</option>
                <option value="package" disabled={!selectedProductPackAvailable}>
                  Paca
                </option>
              </select>
            )}

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
                  const lineKey = buildDedupKey(item.productId, item.saleUnit);
                  const saleUnitLabel = item.saleUnit === 'package' ? ' (Paca)' : '';
                  return (
                    <li
                      key={lineKey}
                      className="flex items-center gap-2 rounded-xl border border-gray-100 bg-cream p-3"
                    >
                      {/* REQ-5 S5-3: thumbnail on added-line row (NOT in native select) */}
                      <ProductThumbnail
                        url={photoUrls[item.productId] ?? null}
                        alt={productName}
                        size={40}
                        className="shrink-0"
                      />
                      <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                        {productName}{saleUnitLabel}
                      </span>

                      {/* Quantity stepper */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateCantidad(item.productId, item.saleUnit, item.cantidad - 1)}
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
                          onClick={() => updateCantidad(item.productId, item.saleUnit, item.cantidad + 1)}
                          className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand"
                          aria-label={`Aumentar cantidad de ${productName}`}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.productId, item.saleUnit)}
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

      {/* ── Product picker dialog ───────────────────────────────── */}
      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        products={products}
        photoUrls={photoUrls}
        onSelect={(p) => {
          setSelectedProductId(p.id);
          setPendingSaleUnit('unit');
        }}
      />

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
