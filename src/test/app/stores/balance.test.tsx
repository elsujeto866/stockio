/**
 * AR-T25 — Store detail page balance section render test.
 *
 * Strict TDD — RED PHASE: written before store detail page extension exists.
 *
 * Verifies:
 *   - Store detail page calls getStoreBalance with the store id
 *   - Balance section renders
 *
 * Covers: REQ-4/S4-1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/data/stores', () => ({
  getStore: vi.fn(),
  getStoreBalance: vi.fn(),
  getStores: vi.fn(),
  createStore: vi.fn(),
  updateStore: vi.fn(),
  deleteStore: vi.fn(),
  getStoreReceivables: vi.fn(),
}));

import { requireUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';
import { getStore, getStoreBalance } from '@/lib/data/stores';
import type { User } from '@supabase/supabase-js';

const mockClient = {};
const mockUser = { id: 'user-1', email: 'test@example.com' } as User;
const STORE_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';

const mockStore = {
  id: STORE_UUID,
  tenant_id: 'tenant-1',
  nombre: 'Main Store',
  contacto: null,
  direccion: null,
  telefono: null,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  payment_terms_days: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(mockClient as Awaited<ReturnType<typeof createClient>>);
  vi.mocked(requireUser).mockResolvedValue(mockUser);
  vi.mocked(getStore).mockResolvedValue(mockStore as never);
  vi.mocked(getStoreBalance).mockResolvedValue(500);
});

describe('Store detail page — balance section (AR-T25)', () => {
  it('calls getStoreBalance with the store id', async () => {
    const { default: StorePage } = await import('@/app/(app)/stores/[id]/page');
    await StorePage({ params: Promise.resolve({ id: STORE_UUID }) });

    expect(getStoreBalance).toHaveBeenCalledWith(mockClient, STORE_UUID);
  });

  it('calls getStore to load store data', async () => {
    const { default: StorePage } = await import('@/app/(app)/stores/[id]/page');
    await StorePage({ params: Promise.resolve({ id: STORE_UUID }) });

    expect(getStore).toHaveBeenCalledWith(mockClient, STORE_UUID);
  });

  it('renders without throwing with mock data', async () => {
    const { default: StorePage } = await import('@/app/(app)/stores/[id]/page');
    await expect(
      StorePage({ params: Promise.resolve({ id: STORE_UUID }) })
    ).resolves.not.toBeNull();
  });
});
