/**
 * Unit tests for getDashboardData seam.
 *
 * Mocks getProducts and getOrders so no DB is needed.
 * Verifies: shape of returned DashboardData, UTC month boundary computation,
 * and that limit:5 is passed to the recent-orders call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product } from '@/lib/data/products';
import type { OrderListItem } from '@/lib/data/orders';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any import of the module under test
// ---------------------------------------------------------------------------
vi.mock('@/lib/data/products', () => ({
  getProducts: vi.fn(),
}));

vi.mock('@/lib/data/orders', () => ({
  getOrders: vi.fn(),
}));

import { getDashboardData } from '@/lib/data/dashboard';
import { getProducts } from '@/lib/data/products';
import { getOrders } from '@/lib/data/orders';
import { createMockSupabaseClient } from '@/test/mocks/supabase';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const lowProduct: Product = {
  id: 'p-low',
  tenant_id: 't1',
  nombre: 'Low Widget',
  sku: null,
  categoria: null,
  precio_unitario: 10,
  stock_actual: 1,
  stock_minimo: 10,
  unidad_medida: null,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  units_per_package: null,
  precio_paca: null,
  cost_price: null,
  shelf_life_days: null,
  expiry_alert_days: 30,
  image_path: null,
};

const okProduct: Product = {
  id: 'p-ok',
  tenant_id: 't1',
  nombre: 'OK Widget',
  sku: null,
  categoria: null,
  precio_unitario: 10,
  stock_actual: 10,
  stock_minimo: 10,
  unidad_medida: null,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  units_per_package: null,
  precio_paca: null,
  cost_price: null,
  shelf_life_days: null,
  expiry_alert_days: 30,
  image_path: null,
};

const recentOrder: OrderListItem = {
  id: 'o-recent',
  tenant_id: 't1',
  store_id: 's1',
  fecha: '2026-06-20',
  estado: 'pendiente',
  total: 100,
  notas: null,
  created_at: '2026-06-20T00:00:00Z',
  store: { nombre: 'Store A' },
};

const periodOrder: OrderListItem = {
  id: 'o-period',
  tenant_id: 't1',
  store_id: 's1',
  fecha: '2026-06-15',
  estado: 'entregado',
  total: 200,
  notas: null,
  created_at: '2026-06-15T00:00:00Z',
  store: { nombre: 'Store A' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('getDashboardData', () => {
  const supabase = createMockSupabaseClient();

  beforeEach(() => {
    // Clear accumulated call history so each test inspects only its own
    // getOrders calls. Without this, mock.calls leaks across tests and the
    // period-query assertion can match a call from a no-`now` test that used
    // the real current date.
    vi.clearAllMocks();
    vi.mocked(getProducts).mockResolvedValue([lowProduct, okProduct]);
    vi.mocked(getOrders)
      .mockResolvedValueOnce([recentOrder])   // first call: recent (limit:5)
      .mockResolvedValueOnce([periodOrder]);  // second call: period (from/to)
  });

  it('returns DashboardData with lowStockProducts filtered correctly', async () => {
    const result = await getDashboardData(supabase as never);
    expect(result.lowStockProducts).toHaveLength(1);
    expect(result.lowStockProducts[0].id).toBe('p-low');
  });

  it('returns recentOrders from the first getOrders call (limit:5)', async () => {
    const result = await getDashboardData(supabase as never);
    expect(result.recentOrders).toHaveLength(1);
    expect(result.recentOrders[0].id).toBe('o-recent');
  });

  it('returns periodOrders from the second getOrders call (date range)', async () => {
    const result = await getDashboardData(supabase as never);
    expect(result.periodOrders).toHaveLength(1);
    expect(result.periodOrders[0].id).toBe('o-period');
  });

  it('computes monthStart as the first day of the UTC month', async () => {
    // Fix "now" to June 26 2026 UTC
    const now = new Date('2026-06-26T10:00:00Z');
    const result = await getDashboardData(supabase as never, now);
    expect(result.period.from).toBe('2026-06-01');
  });

  it('computes today as the UTC date of "now"', async () => {
    const now = new Date('2026-06-26T10:00:00Z');
    const result = await getDashboardData(supabase as never, now);
    expect(result.period.to).toBe('2026-06-26');
  });

  it('includes a human-readable period label', async () => {
    const now = new Date('2026-06-26T10:00:00Z');
    const result = await getDashboardData(supabase as never, now);
    // Label must contain the Spanish month name and the year
    expect(result.period.label).toMatch(/junio/i);
    expect(result.period.label).toContain('2026');
  });

  it('calls getOrders with limit:5 for the recent query', async () => {
    const now = new Date('2026-06-26T10:00:00Z');
    await getDashboardData(supabase as never, now);

    const calls = vi.mocked(getOrders).mock.calls;
    // The recent call must pass limit:5
    const recentCall = calls.find((c) => (c[1] as { limit?: number } | undefined)?.limit === 5);
    expect(recentCall).toBeDefined();
  });

  it('calls getOrders with from/to for the period query', async () => {
    const now = new Date('2026-06-26T10:00:00Z');
    await getDashboardData(supabase as never, now);

    const calls = vi.mocked(getOrders).mock.calls;
    const periodCall = calls.find(
      (c) => (c[1] as { from?: string } | undefined)?.from === '2026-06-01'
    );
    expect(periodCall).toBeDefined();
    expect((periodCall![1] as { to?: string }).to).toBe('2026-06-26');
  });
});
