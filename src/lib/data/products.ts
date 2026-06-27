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
  'id, tenant_id, nombre, sku, categoria, precio_unitario, stock_actual, stock_minimo, unidad_medida, activo, created_at, units_per_package, precio_paca';

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

/**
 * Adjusts stock_actual by delta (signed integer).
 * Reads the current product, computes the next value, then updates.
 *
 * The DB CHECK constraint (stock_actual >= 0) is the floor:
 * if delta would push stock below 0, Postgres raises code 23514 and the
 * update is rejected atomically — we map that to StockUnderflowError (R5).
 *
 * Concurrency note: read-then-update is accepted for single-admin MVP.
 * A FOR UPDATE RPC is the documented upgrade path if concurrent edits arise.
 */
export async function adjustStock(
  supabase: SupabaseClient,
  productId: string,
  delta: number
): Promise<Product> {
  const product = await getProduct(supabase, productId);
  if (!product) throw new Error(`Product not found: ${productId}`);

  const next = product.stock_actual + delta;

  const { data, error } = await supabase
    .from('products')
    .update({ stock_actual: next })
    .eq('id', productId)
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (error.code === '23514') {
      throw new StockUnderflowError(productId);
    }
    throw error;
  }

  return data as Product;
}
