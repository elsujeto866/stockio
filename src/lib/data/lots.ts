/**
 * Data seam for lots (inventory batches).
 *
 * All reads are PostgREST selects under the SELECT grant on public.lots.
 * All writes go through SECURITY DEFINER RPCs (no direct writes from client).
 *
 * Inject a Supabase client — never import one here.
 * RLS enforces tenant scoping — no tenant_id filter needed in the app.
 *
 * Covers: REQ-6 (expiry alerts)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Mirrors the public.lots table schema. */
export interface Lot {
  id: string;
  tenant_id: string;
  product_id: string;
  purchase_id: string | null;
  lot_type: 'purchase' | 'adjustment' | 'restore';
  quantity: number;
  received_date: string;
  expiry_date: string | null;
  batch_ref: string | null;
  created_at: string;
}

/** Lot joined with minimal product info for alert display. */
export interface LotWithProduct extends Lot {
  product: {
    id: string;
    nombre: string;
    expiry_alert_days: number;
  } | null;
}

/** Summary counts for the ExpiringSoonWidget. */
export interface ExpiringSoonSummary {
  expiredCount: number;
  expiringSoonCount: number;
  /** Up to 5 near-expiry lots for quick display (sorted by expiry_date ASC). */
  nearExpiry: LotWithProduct[];
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all lots for a product, ordered for FEFO display (expiry ASC NULLS LAST).
 * Includes zero-quantity lots (audit trail display — let the UI filter if needed).
 */
export async function getLotsByProduct(
  supabase: SupabaseClient,
  productId: string
): Promise<Lot[]> {
  const { data, error } = await supabase
    .from('lots')
    .select('id, tenant_id, product_id, purchase_id, lot_type, quantity, received_date, expiry_date, batch_ref, created_at')
    .eq('product_id', productId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .order('received_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Lot[];
}

/**
 * Returns all active (quantity > 0) lots with a non-null expiry_date that is
 * on or before today, joined with product name and expiry_alert_days.
 * Used for the expired lots alert display.
 */
export async function getExpiredLots(supabase: SupabaseClient): Promise<LotWithProduct[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('lots')
    .select('id, tenant_id, product_id, purchase_id, lot_type, quantity, received_date, expiry_date, batch_ref, created_at, product:products(id, nombre, expiry_alert_days)')
    .gt('quantity', 0)
    .not('expiry_date', 'is', null)
    .lt('expiry_date', today)
    .order('expiry_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as LotWithProduct[];
}

/**
 * Returns active lots expiring within each product's individual alert window
 * (expiry_date >= today AND expiry_date <= today + product.expiry_alert_days).
 *
 * Because per-row window comparison against a per-product value requires a join
 * that PostgREST can express, we fetch all active dated lots and apply the
 * per-product alertDays filter client-side.
 *
 * NULL-expiry lots are always excluded (S6-3).
 */
export async function getExpiringLots(supabase: SupabaseClient): Promise<LotWithProduct[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('lots')
    .select('id, tenant_id, product_id, purchase_id, lot_type, quantity, received_date, expiry_date, batch_ref, created_at, product:products(id, nombre, expiry_alert_days)')
    .gt('quantity', 0)
    .not('expiry_date', 'is', null)
    .gte('expiry_date', today)
    .order('expiry_date', { ascending: true });

  if (error) throw error;

  const lots = (data ?? []) as unknown as LotWithProduct[];

  // Filter: only keep lots within the product's alert window
  return lots.filter((lot) => {
    const alertDays = lot.product?.expiry_alert_days ?? 30;
    const thresholdDate = addDays(today, alertDays);
    return lot.expiry_date !== null && lot.expiry_date <= thresholdDate;
  });
}

/**
 * Returns aggregate counts for the dashboard ExpiringSoonWidget:
 *   - expiredCount: active lots with expiry_date < today
 *   - expiringSoonCount: active lots with today <= expiry_date <= today + alertDays
 *   - nearExpiry: up to 5 earliest-expiry lots for quick preview
 */
export async function getExpiringSoonSummary(
  supabase: SupabaseClient
): Promise<ExpiringSoonSummary> {
  const [expiredLots, expiringLots] = await Promise.all([
    getExpiredLots(supabase),
    getExpiringLots(supabase),
  ]);

  return {
    expiredCount: expiredLots.length,
    expiringSoonCount: expiringLots.length,
    nearExpiry: expiringLots.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
