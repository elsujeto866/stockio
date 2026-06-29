/**
 * productPhotos — client-side storage module for product photo uploads.
 *
 * PP-T11: REQ-1, REQ-2; Design D1, D2, §4.
 * Imported only in client components ('use client').
 */

import imageCompression from 'browser-image-compression';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'product-photos';

const COMPRESS_OPTIONS = {
  maxWidthOrHeight: 800,
  maxSizeMB: 0.2,
  useWebWorker: true,
  fileType: 'image/jpeg' as const,
  initialQuality: 0.7,
};

/**
 * Returns the deterministic storage path for a product photo.
 * Always uses .jpg (D2: deterministic extension; upsert overwrite always hits same object).
 */
export function buildPhotoPath(tenantId: string, productId: string): string {
  return `${tenantId}/${productId}.jpg`;
}

/**
 * Compresses and uploads a product photo to the product-photos bucket.
 *
 * - Compresses to ~800×800 JPEG at q0.7 (D2, REQ-2).
 * - Uploads with upsert:true (replace = overwrite in-place; zero orphan on normal replace).
 * - Calls remove(previousPath) ONLY when previousPath differs from current path
 *   (legacy-extension cleanup; normal replace via upsert needs no remove call).
 *
 * @returns the constructed storage path string
 */
export async function uploadProductPhoto(
  supabase: SupabaseClient,
  o: { tenantId: string; productId: string; file: File; previousPath?: string | null }
): Promise<string> {
  const blob = await imageCompression(o.file, COMPRESS_OPTIONS);
  const path = buildPhotoPath(o.tenantId, o.productId);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });

  if (error) throw error;

  // Remove previous object only when it has a different path (legacy extension cleanup).
  // When previousPath === path, upsert already overwrote it — no remove needed.
  if (o.previousPath && o.previousPath !== path) {
    await supabase.storage.from(BUCKET).remove([o.previousPath]);
  }

  return path;
}

/**
 * Deletes a product photo object from the product-photos bucket.
 * Called when the user removes the photo from a product (S1-4).
 */
export async function deleteProductPhoto(
  supabase: SupabaseClient,
  path: string
): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
