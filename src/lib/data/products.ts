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
}

/**
 * Returns all active products for the authenticated user's tenant.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 */
export async function getProducts(supabase: SupabaseClient): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, tenant_id, nombre, sku, categoria, precio_unitario, stock_actual, stock_minimo, unidad_medida, activo, created_at'
    )
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
    .select(
      'id, tenant_id, nombre, sku, categoria, precio_unitario, stock_actual, stock_minimo, unidad_medida, activo, created_at'
    )
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Product;
}
