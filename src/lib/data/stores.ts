import type { SupabaseClient } from '@supabase/supabase-js';

export interface Store {
  id: string;
  tenant_id: string;
  nombre: string;
  contacto: string | null;
  direccion: string | null;
  telefono: string | null;
  activo: boolean;
  created_at: string;
  /** Days after invoice issue date when payment is due. Default 30. */
  payment_terms_days: number;
  /** Fiscal buyer identification type code. Default '07' (Consumidor Final). */
  tipo_identificacion: string;
  /** Fiscal buyer ID number (cédula, RUC, pasaporte). NULL means consumidor final. */
  numero_identificacion: string | null;
  /** Legal name for the comprobante. NULL falls back to stores.nombre at emit time. */
  razon_social_comprobante: string | null;
}

/**
 * Input shape for createStore and updateStore.
 * No tenant_id — RLS get_tenant_id() default fills it server-side.
 */
export interface StoreInput {
  nombre: string;
  contacto?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  payment_terms_days?: number;
  tipo_identificacion?: string;
  numero_identificacion?: string | null;
  razon_social_comprobante?: string | null;
}

// ---------------------------------------------------------------------------
// Column list — shared by all queries and mutations to avoid drift.
// Must be a single string literal (no + concatenation) so Supabase's
// type-level parser can infer column names correctly.
// ---------------------------------------------------------------------------
const SELECT_COLS =
  'id, tenant_id, nombre, contacto, direccion, telefono, activo, created_at, payment_terms_days, tipo_identificacion, numero_identificacion, razon_social_comprobante';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all active stores for the authenticated user's tenant.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Inject a Supabase client — never import one here.
 */
export async function getStores(supabase: SupabaseClient): Promise<Store[]> {
  const { data, error } = await supabase
    .from('stores')
    .select(SELECT_COLS)
    .eq('activo', true)
    .order('nombre');

  if (error) throw error;
  return (data ?? []) as Store[];
}

/**
 * Returns a single store by id, or null if not found / RLS blocks access.
 */
export async function getStore(
  supabase: SupabaseClient,
  id: string
): Promise<Store | null> {
  const { data, error } = await supabase
    .from('stores')
    .select(SELECT_COLS)
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Store;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Creates a new store.
 *
 * tenant_id is NOT accepted from user input. It is resolved server-side
 * by calling the SECURITY DEFINER get_tenant_id() RPC, which reads the
 * authenticated user's profile row. This makes tenant spoofing impossible.
 */
export async function createStore(
  supabase: SupabaseClient,
  input: StoreInput
): Promise<Store> {
  const { data: tenantId, error: tenantErr } = await supabase.rpc('get_tenant_id');
  if (tenantErr || !tenantId) throw new Error('Could not resolve tenant: not authenticated');

  const { data, error } = await supabase
    .from('stores')
    .insert({ ...input, tenant_id: tenantId as string })
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return data as Store;
}

/**
 * Updates an existing store owned by the authenticated tenant.
 * RLS ensures cross-tenant edits are blocked at the DB level.
 */
export async function updateStore(
  supabase: SupabaseClient,
  id: string,
  input: StoreInput
): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .update(input)
    .eq('id', id)
    .select(SELECT_COLS)
    .single();

  if (error) throw error;
  return data as Store;
}

/**
 * Soft-deletes a store by setting activo = false.
 * NEVER issues a hard DELETE — orders reference stores by FK.
 * RLS ensures only the owner's stores are affected.
 */
export async function deleteStore(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update({ activo: false })
    .eq('id', id);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// AR-T14 — Receivables: getStoreBalance + getStoreReceivables (REQ-4)
// ---------------------------------------------------------------------------

export interface StoreReceivable {
  storeId: string;
  storeName: string;
  saldo: number;
}

/**
 * Returns the total outstanding balance for a single store.
 *
 * outstanding = SUM(total - total_paid) over non-cancelled-order invoices.
 * Fetches all non-cancelled invoices with store info and filters in TypeScript
 * (consistent with getStoreReceivables aggregation pattern).
 * RLS enforces tenant scoping — no explicit filter needed.
 */
export async function getStoreBalance(
  supabase: SupabaseClient,
  storeId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('invoices')
    .select('total, total_paid, order:orders!inner(estado, store:stores!inner(id))')
    .neq('order.estado', 'cancelado');

  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<{
    total: number;
    total_paid: number;
    order: { store: { id: string } | null } | null;
  }>;

  return rows
    .filter((row) => row.order?.store?.id === storeId)
    .reduce((sum, row) => {
      return Math.round((sum + Math.max(0, Number(row.total) - Number(row.total_paid))) * 100) / 100;
    }, 0);
}

/**
 * Returns per-store outstanding balances for all stores in the tenant.
 *
 * Aggregates SUM(total - total_paid) per store, excluding cancelled-order invoices.
 * RLS enforces tenant scoping.
 */
export async function getStoreReceivables(
  supabase: SupabaseClient
): Promise<StoreReceivable[]> {
  // Fetch all non-cancelled invoices with their store info
  const { data, error } = await supabase
    .from('invoices')
    .select('total, total_paid, order:orders!inner(estado, store:stores(id, nombre))')
    .neq('order.estado', 'cancelado');

  if (error) throw error;

  // Aggregate in TypeScript, mirroring existing nested-select style
  const accumulator = new Map<string, { storeName: string; saldo: number }>();

  for (const row of (data ?? []) as unknown as Array<{
    total: number;
    total_paid: number;
    order: { store: { id: string; nombre: string } | null } | null;
  }>) {
    const store = row.order?.store;
    if (!store) continue;

    const outstanding = Math.max(0, Number(row.total) - Number(row.total_paid));
    const existing = accumulator.get(store.id);
    if (existing) {
      existing.saldo = Math.round((existing.saldo + outstanding) * 100) / 100;
    } else {
      accumulator.set(store.id, { storeName: store.nombre, saldo: Math.round(outstanding * 100) / 100 });
    }
  }

  return Array.from(accumulator.entries()).map(([storeId, { storeName, saldo }]) => ({
    storeId,
    storeName,
    saldo,
  }));
}
