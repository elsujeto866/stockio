'use client';

/**
 * ProductPicker — searchable product card dialog for OrderBuilder and PurchaseBuilder.
 *
 * Design decisions (ADR-1 through ADR-6):
 *   - Native <dialog> element, no npm dependency.
 *   - <dialog> rendered UNCONDITIONALLY so the ref is stable. Inner content
 *     gated by {open && ...} so jsdom tests can assert on rendered children
 *     without triggering the UA dialog:not([open]){display:none} rule that
 *     jsdom does not apply anyway.
 *   - Feature-detected showModal()/close() via useEffect — NEVER put the
 *     `open` attribute in JSX (mixing JSX attr with showModal() throws in
 *     real browsers).
 *   - onSelect = set-selected only (NOT auto-add). Builder owns all mutation.
 *   - stock=0 cards: red "Sin stock" badge but button is NOT disabled (server
 *     is the stock authority).
 *   - Search: client-side useMemo over nombre + sku? + categoria? (both nullable).
 *   - Reuses ProductThumbnail (next/image unoptimized, lazy by default).
 */

import { useState, useRef, useMemo, useEffect } from 'react';
import type { Product } from '@/lib/data/products';
import { ProductThumbnail } from '@/components/products/ProductThumbnail';
import { formatCurrency } from '@/lib/format';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ProductPickerProps {
  products: Product[];
  /** productId → signed URL. Pass {} when no photos. */
  photoUrls: Record<string, string>;
  open: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lowercase + decompose NFD diacritics so "lact" matches "Lácteos".
 * Combining diacritical marks U+0300–U+036F are stripped after NFD.
 */
function nrm(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, '');
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ProductPicker({
  products,
  photoUrls,
  open,
  onClose,
  onSelect,
}: ProductPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');

  // Feature-detected open/close.
  // Real browsers: showModal()/close() control the native modal (focus-trap,
  // backdrop, Escape). jsdom: showModal/close are unimplemented stubs, so we
  // fall back to setAttribute('open')/removeAttribute to ensure the dialog
  // element has the `open` attribute — RTL's getByRole('dialog') requires it
  // (jsdom applies dialog:not([open]){display:none} from the UA stylesheet).
  // Do NOT put `open` attribute in JSX: mixing it with showModal() throws
  // InvalidStateError in real browsers.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) {
      if (typeof d.showModal === 'function') {
        d.showModal();
      } else {
        d.setAttribute('open', ''); // jsdom fallback
      }
    } else {
      if (typeof d.close === 'function') {
        d.close();
      } else {
        d.removeAttribute('open'); // jsdom fallback
      }
    }
  }, [open]);

  // Reset search query when dialog closes so reopening starts fresh.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const q = nrm(query.trim());

  const filtered = useMemo(() => {
    if (!q) return products;
    return products.filter(
      (p) =>
        nrm(p.nombre).includes(q) ||
        (p.sku ? nrm(p.sku).includes(q) : false) ||
        (p.categoria ? nrm(p.categoria).includes(q) : false)
    );
  }, [products, q]);

  return (
    // <dialog> ALWAYS in DOM — never conditional.
    // aria-label gives accessible name queried by getByRole('dialog', { name: ... }).
    // onCancel fires when Escape is pressed (real browser); preventDefault prevents
    // the native close so React controls the state.
    // onClose fires after close() is called (real browser) — sync back to React.
    <dialog
      ref={dialogRef}
      aria-label="Seleccionar producto"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="m-0 mt-auto w-full max-w-full max-h-[85dvh] rounded-t-2xl border-0 bg-white p-0 shadow-xl backdrop:bg-black/40 open:flex open:flex-col"
    >
      {/* Inner content gated — when open=false nothing renders here.
          jsdom does not apply UA display:none for dialog, so this boolean
          gate is the sole guard for test assertions on children. */}
      {open && (
        <>
          {/* ── Sticky header: search + close ─────────────────────── */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
            <input
              aria-label="Buscar producto"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto…"
              className={`flex-1 ${inputClass}`}
              autoComplete="off"
            />
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand"
            >
              ✕
            </button>
          </div>

          {/* ── Product grid / empty states ───────────────────────── */}
          <div className="overflow-y-auto p-4">
            {products.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                No hay productos disponibles
              </p>
            ) : filtered.length === 0 && q ? (
              <p className="py-8 text-center text-sm text-gray-500">
                Sin resultados para «{query.trim()}»
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelect(p);
                      onClose();
                    }}
                    className="flex flex-col gap-1 rounded-xl border border-gray-100 p-2 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <ProductThumbnail
                      url={photoUrls[p.id] ?? null}
                      alt={p.nombre}
                      size={96}
                    />
                    <span className="text-sm font-medium truncate w-full">
                      {p.nombre}
                    </span>
                    <span className="text-sm text-gray-600">
                      {formatCurrency(p.precio_unitario)}
                    </span>
                    <span
                      className={
                        p.stock_actual === 0
                          ? 'text-danger text-xs'
                          : 'text-gray-500 text-xs'
                      }
                    >
                      {p.stock_actual === 0
                        ? 'Sin stock'
                        : `Stock: ${p.stock_actual}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
