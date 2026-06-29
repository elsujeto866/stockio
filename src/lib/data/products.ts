import type { SupabaseClient } from '@supabase/supabase-js';

export interface Product {
  id: string;
  tenant_id: string;
  nombre: string;
  sku: string | null;
  categoria: string | null;
  precio_unitario: number;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida: string | null;
  activo: boolean;
  created_at: string;
  /** NULL = unit-only product; >= 2 = packaged product. */
  units_per_package: number | null;
  /** Price per pack. NULL for unit-only products. */
  precio_paca: number | null;
  /** Manual reference unit cost. NULL = cost unset → margin unknown. */
  cost_price: number | null;
  /** Days product is valid after receipt. NULL = no shelf-life set; expiry must be entered manually. */
  shelf_life_days: number | null;
  /** Days before expiry to classify the lot as "expiring soon". NOT NULL DEFAULT 30. */
  expiry_alert_days: number;
  /** Storage path in product-photos bucket. NULL = no photo. */
  image_path: string | null;
}

/**
 * Input shape for createProduct and updateProduct.
 * No tenant_id — RLS get_tenant_id() default fills it server-side.
 */
export interface ProductInput {
  nombre: string;
  sku?: string | null;
  categoria?: string | null;
  precio_unitario: number;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida?: string | null;
  units_per_package?: number | null;
  precio_paca?: number | null;
  cost_price?: number | null;
  shelf_life_days?: number | null;
  expiry_alert_days?: number;
  /** Storage path in product-photos bucket. NULL = no photo. */
  image_path?: string | null;
  /** Client-generated UUID for deterministic create (D1). */
  id?: string;
}

/**
 * Thrown by adjustStock when the DB CHECK constraint rejects a stock
 * update that would take stock_actual below zero (Postgres code 23514).
 */
export class StockUnderflowError extends Error {
  readonly productId: string;

  constructor(productId: string) {
    super('Stock cannot go below zero');
    this.name = 'StockUnderflowError';
    this.productId = productId;
    // Maintain correct prototype chain in compiled JS
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Column list — shared by all queries and mutations to avoid drift
// ---------------------------------------------------------------------------
const SELECT_COLS =
  'id, tenant_id, nombre, sku, categoria, precio_unitario, stock_actual, stock_minimo, unidad_medida, activo, created_at, units_per_package, precio_paca, cost_price, shelf_life_days, expiry_alert_days, image_path';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all active products for the authenticated user's tenant.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 */
export async function getProducts(supabase: SupabaseClient): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLS)
    .eq('activo', true)
    .order('nombre');

  if (error) throw error;
  return (data ?? []) as Product[];
}

/**
 * Returns a single product by id, or null if not found / RLS blocks access.
 */
export async function getProduct(
  supabase: SupabaseClient,
  id: string
): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLS)
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Product;
}

// ---------------------------------------------------------------------------
// Mutations — R1, R3, R4, R5, R8
// ---------------------------------------------------------------------------

/**
 * Creates a new product.
 *
 * tenant_id is NOT accepted from user input (R8). It is resolved server-side
 * by calling the SECURITY DEFINER get_tenant_id() RPC, which reads the
 * authenticated user's profile row. This makes tenant spoofing impossible:
 * the user controls none of the tenant resolution.
 */
export async function createProduct(
  supabase: SupabaseClient,
  input: ProductInput
): Promise<Product> {
  const { data: tenantId, error: tenantErr } = await supabase.rpc('get_tenant_id');
  if (tenantErr || !tenantId) throw new Error('Could not resolve tenant: not authenticated');

  const { data, error } = await supabase
    .from('products')
    .insert({ ...input, tenant_id: tenantId as string })
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return data as Product;
}

/**
 * Updates an existing product owned by the authenticated tenant.
 * RLS ensures cross-tenant edits are blocked at the DB level (R3).
 */
export async function updateProduct(
  supabase: SupabaseClient,
  id: string,
  input: ProductInput
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(input)
    .eq('id', id)
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return data as Product;
}

/**
 * Soft-deletes a product by setting activo = false.
 * NEVER issues a hard DELETE — order_items reference products by FK (R4).
 * RLS ensures only the owner's products are affected.
 */
export async function deleteProduct(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ activo: false })
    .eq('id', id);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Signed URL batch helper — REQ-4 (S4-1, S4-2, S4-3)
// ---------------------------------------------------------------------------

const PHOTO_BUCKET = 'product-photos';

/**
 * Resolves signed URLs for a list of storage paths in ONE batched call.
 *
 * - Deduplicates paths with a Set before calling storage.
 * - Short-circuits on empty input: no storage API call made (S4-2).
 * - expiresIn = 3600 (1-hour TTL, S4-3).
 * - Degrades gracefully on error: returns empty Map → callers render placeholders.
 *
 * @param supabase - Authenticated Supabase client (server-side RSC only).
 * @param paths - Array of storage paths (may include null/falsy values; filtered internally).
 * @returns Map<path, signedUrl>
 */
export async function getSignedUrls(
  supabase: SupabaseClient,
  paths: string[]
): Promise<Map<string, string>> {
  const clean = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (clean.length === 0) return out; // short-circuit: NO storage call

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(clean, 3600);

  if (error) return out; // degrade gracefully → placeholders

  for (const item of (data as Array<{ path?: string; signedUrl?: string | null; error?: unknown }>) ?? []) {
    if (item.signedUrl && !item.error && item.path) out.set(item.path, item.signedUrl);
  }
  return out;
}

/**
 * Adjusts stock_actual by delta (signed integer) via the adjust_stock SECURITY DEFINER RPC.
 *
 * Positive delta: creates an 'adjustment' lot + increments stock_actual.
 * Negative delta: FEFO-consumes lots + decrements stock_actual.
 * Zero delta: no-op (RPC returns the unchanged product row).
 *
 * The RPC raises errcode 23514 when the negative delta would push stock below 0.
 * We map that to StockUnderflowError (D6 — keeps existing error mapping unchanged).
 *
 * Returns: the updated Product row (D7 — single round-trip, no re-fetch needed).
 */
export async function adjustStock(
  supabase: SupabaseClient,
  productId: string,
  delta: number
): Promise<Product> {
  const { data, error } = await supabase.rpc('adjust_stock', {
    p_product_id: productId,
    p_delta: delta,
  });

  if (error) {
    if (error.code === '23514') {
      throw new StockUnderflowError(productId);
    }
    throw error;
  }

  return data as Product;
}
