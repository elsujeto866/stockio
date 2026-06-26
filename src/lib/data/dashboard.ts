/**
 * Dashboard data seam.
 *
 * Aggregates three parallel queries into a single DashboardData object.
 * Inject a Supabase client — never import one here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product } from '@/lib/data/products';
import type { OrderListItem } from '@/lib/data/orders';
import { getProducts } from '@/lib/data/products';
import { getOrders } from '@/lib/data/orders';
import { filterLowStock } from '@/lib/domain/dashboard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardData {
  lowStockProducts: Product[];
  recentOrders: OrderListItem[];
  periodOrders: OrderListItem[];
  period: { from: string; to: string; label: string };
}

// ---------------------------------------------------------------------------
// Month name lookup (English, UTC-based label)
// ---------------------------------------------------------------------------
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Seam function
// ---------------------------------------------------------------------------

/**
 * Fetches all data needed for the dashboard in three parallel queries.
 *
 * @param supabase  Authenticated Supabase client.
 * @param now       Override "current time" for deterministic tests. Defaults to new Date().
 */
export async function getDashboardData(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<DashboardData> {
  // UTC month boundary — avoids TZ-midnight off-by-one for date-typed columns
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const monthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // "YYYY-MM-01"
  const today = now.toISOString().slice(0, 10);                              // "YYYY-MM-DD"
  const label = `${MONTH_NAMES[m]} ${y}`;

  const [allProducts, recentOrders, periodOrders] = await Promise.all([
    getProducts(supabase),
    getOrders(supabase, { limit: 5 }),
    getOrders(supabase, { from: monthStart, to: today }),
  ]);

  return {
    lowStockProducts: filterLowStock(allProducts),
    recentOrders,
    periodOrders,
    period: { from: monthStart, to: today, label },
  };
}
