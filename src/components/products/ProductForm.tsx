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
 *   Group C: photo upload (REQ-1, REQ-2)
 *
 * Photo upload flow (D1, Design §5):
 *   1. MIME check — reject non-images immediately (S2-2)
 *   2. Compress with imageCompression (~800×800, q0.7)
 *   3. Post-compress size guard > 5 MiB (S2-3)
 *   4. Upload via uploadProductPhoto (upsert + cleanup)
 *   5. setImagePath(path) — flows via hidden input to server action
 *
 * LINT GOTCHA (bit BackfillNotice / S4-T28):
 *   - Single client directive at top (no duplicates).
 *   - productId seeded via lazy useState(() => ...) initializer, NEVER useEffect.
 *   - Object-URL revocation inside onChange handler, NOT a useEffect.
 *
 * Touch targets are ≥44px. Submit is disabled while the action is pending or uploading.
 */

import { useActionState, useState, useRef } from 'react';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';
import { createClient } from '@/lib/supabase/client';
import { uploadProductPhoto, deleteProductPhoto } from '@/lib/storage/productPhotos';
import type { ActionResult } from '@/app/(app)/products/actions';
import type { Product } from '@/lib/data/products';

const COMPRESS_OPTIONS = {
  maxWidthOrHeight: 800,
  maxSizeMB: 0.2,
  useWebWorker: true,
  fileType: 'image/jpeg' as const,
  initialQuality: 0.7,
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB post-compress guard

interface Props {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  initialData?: Product;
  /** Server-resolved tenant id for building storage paths (D8). */
  tenantId?: string;
  /** Signed URL of the existing photo (resolved by the edit page). */
  initialImageUrl?: string | null;
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

export function ProductForm({ action, initialData, tenantId, initialImageUrl }: Props) {
  const [state, dispatch, isPending] = useActionState(action, null);
  const isEdit = !!initialData;

  // D1: client-generated UUID as BOTH row id and storage object basename.
  // Lazy initializer — lint-safe (no setState-in-effect).
  const [productId] = useState(() => initialData?.id ?? crypto.randomUUID());

  // Photo state
  const [imagePath, setImagePath] = useState<string | null>(initialData?.image_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const prevPreviewRef = useRef<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Step 1: MIME check (S2-2)
    if (!file.type.startsWith('image/')) {
      setUploadError('Solo se permiten archivos de imagen (image/*).');
      return;
    }

    // Revoke previous object URL before creating a new one
    if (prevPreviewRef.current) {
      URL.revokeObjectURL(prevPreviewRef.current);
    }
    const preview = URL.createObjectURL(file);
    prevPreviewRef.current = preview;
    setLocalPreview(preview);

    setUploading(true);
    try {
      // Step 2: compress
      const compressed = await imageCompression(file, COMPRESS_OPTIONS);

      // Step 3: post-compress size guard (S2-3)
      if (compressed.size > MAX_BYTES) {
        setUploadError('La imagen comprimida supera los 5 MB. Seleccioná una imagen más pequeña.');
        setLocalPreview(null);
        if (prevPreviewRef.current) {
          URL.revokeObjectURL(prevPreviewRef.current);
          prevPreviewRef.current = null;
        }
        return;
      }

      // Step 4: upload (upsert + cleanup)
      const supabase = createClient();
      const path = await uploadProductPhoto(supabase, {
        tenantId: tenantId ?? '',
        productId,
        file,
        previousPath: imagePath,
      });

      // Step 5: set path → flows via hidden input
      setImagePath(path);
    } catch {
      setUploadError('Error al subir la imagen. Intentá de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto() {
    if (!imagePath) return;
    try {
      const supabase = createClient();
      await deleteProductPhoto(supabase, imagePath);
    } catch {
      // best-effort; UI still clears
    }
    setImagePath(null);
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
      prevPreviewRef.current = null;
    }
  }

  // Preview precedence: localPreview > initialImageUrl > null (placeholder rendered by Image)
  const displayUrl = localPreview ?? initialImageUrl ?? null;

  return (
    <form action={dispatch} className="space-y-6">
      {/* D1: hidden id — ALWAYS present (create + edit), stable across retries */}
      <input type="hidden" name="id" value={productId} />

      {/* hidden image_path — empty string → null via schema transform */}
      <input type="hidden" name="image_path" value={imagePath ?? ''} />

      {/* ── Group C: photo upload ────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-amber-400" />
        <div className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wide">
            Foto del producto
          </h2>

          {/* Preview */}
          <div className="flex items-center gap-4">
            {displayUrl ? (
              <Image
                src={displayUrl}
                alt="Vista previa"
                width={80}
                height={80}
                unoptimized
                className="shrink-0 rounded-lg object-cover border border-gray-200"
              />
            ) : (
              <div
                aria-hidden
                style={{ width: 80, height: 80 }}
                className="shrink-0 rounded-lg bg-gray-100 border border-gray-200"
              />
            )}

            <div className="flex flex-col gap-2">
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-within:ring-2 focus-within:ring-brand">
                {uploading ? 'Subiendo…' : 'Seleccionar imagen'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>

              {imagePath && !uploading && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="btn-danger px-3 py-1.5 text-sm"
                >
                  Eliminar foto
                </button>
              )}
            </div>
          </div>

          {uploadError && (
            <p role="alert" className="text-xs text-danger">
              {uploadError}
            </p>
          )}
        </div>
      </div>

      {/* ── Group A: identity fields ────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-brand" />
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-brand uppercase tracking-wide">
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
              className={inputClass}
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
              className={inputClass}
              placeholder="e.g. OL-001"
            />
            <FieldError messages={state?.fieldErrors?.sku} />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="presentacion"
              className="block text-sm font-medium text-gray-700"
            >
              Presentación
            </label>
            <input
              id="presentacion"
              name="presentacion"
              type="text"
              defaultValue={initialData?.presentacion ?? ''}
              className={inputClass}
              placeholder="p. ej. 70 g, 22g x6"
            />
            <FieldError messages={state?.fieldErrors?.presentacion} />
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
                className={inputClass}
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
                className={inputClass}
                placeholder="e.g. kg"
              />
              <FieldError messages={state?.fieldErrors?.unidad_medida} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Group B: numeric fields ─────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1 bg-info" />
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-info uppercase tracking-wide">
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
              className={inputClass}
              placeholder="0.00"
            />
            <FieldError messages={state?.fieldErrors?.precio_unitario} />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="cost_price"
              className="block text-sm font-medium text-gray-700"
            >
              Costo unitario
            </label>
            <input
              id="cost_price"
              name="cost_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initialData?.cost_price ?? ''}
              className={inputClass}
              placeholder="0.00"
            />
            <FieldError messages={state?.fieldErrors?.cost_price} />
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
                className={inputClass}
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
                className={inputClass}
                placeholder="0"
              />
              <FieldError messages={state?.fieldErrors?.stock_minimo} />
            </div>
          </div>

          {/* ── Expiry fields ────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="shelf_life_days"
                className="block text-sm font-medium text-gray-700"
              >
                Vida útil (días)
              </label>
              <input
                id="shelf_life_days"
                name="shelf_life_days"
                type="number"
                min="1"
                step="1"
                defaultValue={initialData?.shelf_life_days ?? ''}
                className={inputClass}
                placeholder="e.g. 90, 180, 270"
              />
              <p className="text-xs text-gray-400">
                Dejar vacío si no se conoce la vida útil.
              </p>
              <FieldError messages={state?.fieldErrors?.shelf_life_days} />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="expiry_alert_days"
                className="block text-sm font-medium text-gray-700"
              >
                Alerta de vencimiento (días)
              </label>
              <input
                id="expiry_alert_days"
                name="expiry_alert_days"
                type="number"
                min="1"
                step="1"
                defaultValue={initialData?.expiry_alert_days ?? 30}
                className={inputClass}
                placeholder="30"
              />
              <FieldError messages={state?.fieldErrors?.expiry_alert_days} />
            </div>
          </div>

          {/* ── Pack fields (optional) ───────────────────────────── */}
          <p className="text-xs text-gray-400">
            Dejar vacío si el producto se vende solo por unidad.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="units_per_package"
                className="block text-sm font-medium text-gray-700"
              >
                Unidades por paca
              </label>
              <input
                id="units_per_package"
                name="units_per_package"
                type="number"
                min="2"
                step="1"
                defaultValue={initialData?.units_per_package ?? ''}
                className={inputClass}
                placeholder="p. ej. 30"
              />
              <FieldError messages={state?.fieldErrors?.units_per_package} />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="precio_paca"
                className="block text-sm font-medium text-gray-700"
              >
                Precio de paca
              </label>
              <input
                id="precio_paca"
                name="precio_paca"
                type="number"
                step="0.01"
                min="0"
                defaultValue={initialData?.precio_paca ?? ''}
                className={inputClass}
                placeholder="0.00"
              />
              <FieldError messages={state?.fieldErrors?.precio_paca} />
            </div>
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
        disabled={isPending || uploading}
        className="btn-primary w-full"
      >
        {isPending ? 'Guardando…' : isEdit ? 'Actualizar producto' : 'Crear producto'}
      </button>
    </form>
  );
}
