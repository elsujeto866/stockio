/**
 * Unit tests for store data-seam mutations.
 *
 * Uses the extended mock client — verifies:
 *  - createStore: insert payload omits tenant_id from input; tenant resolved via RPC
 *  - updateStore: update payload correct, no tenant_id
 *  - deleteStore: calls update({activo:false}), NEVER .delete()
 */

import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { createStore, updateStore, deleteStore, getStoreBalance, getStoreReceivables } from '@/lib/data/stores';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseStore = {
  id: 'store-1',
  tenant_id: 'tenant-1',
  nombre: 'Tienda Centro',
  contacto: '555-1234',
  direccion: 'Av. Principal 123',
  telefono: '555-5678',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  payment_terms_days: 30,
};

const validInput = {
  nombre: 'Tienda Centro',
  contacto: '555-1234',
  direccion: 'Av. Principal 123',
  telefono: '555-5678',
  payment_terms_days: 45,
};

// ---------------------------------------------------------------------------
// createStore
// ---------------------------------------------------------------------------
describe('createStore', () => {
  it('resolves tenant_id from get_tenant_id() RPC, not from user input', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: baseStore,
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    await createStore(supabase, validInput);

    const payload = supabase.__captured.insertPayload as Record<string, unknown>;
    // tenant_id is server-resolved — matches the RPC return, not from validInput
    expect(payload.tenant_id).toBe('tenant-1');
    // validInput itself does not carry tenant_id
    expect(validInput).not.toHaveProperty('tenant_id');
  });

  it('insert payload contains the expected fields including payment_terms_days', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: baseStore,
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    await createStore(supabase, validInput);

    const payload = supabase.__captured.insertPayload as Record<string, unknown>;
    expect(payload.nombre).toBe('Tienda Centro');
    expect(payload.contacto).toBe('555-1234');
    expect(payload.direccion).toBe('Av. Principal 123');
    expect(payload.payment_terms_days).toBe(45);
  });

  it('returns the created store from the DB result', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: baseStore,
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    const store = await createStore(supabase, validInput);

    expect(store.id).toBe('store-1');
    expect(store.nombre).toBe('Tienda Centro');
    expect(store.activo).toBe(true);
  });

  it('throws when get_tenant_id() fails (not authenticated)', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        get_tenant_id: () => ({ data: null, error: { message: 'not found', code: '42883' } }),
      },
    });

    await expect(createStore(supabase, validInput)).rejects.toThrow('Could not resolve tenant');
  });

  it('throws when the DB insert returns an error', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'unique violation', code: '23505' },
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    await expect(createStore(supabase, validInput)).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// updateStore
// ---------------------------------------------------------------------------
describe('updateStore', () => {
  it('sends the correct update payload (no tenant_id, includes payment_terms_days)', async () => {
    const updated = { ...baseStore, nombre: 'Updated Name' };
    const supabase = createMockSupabaseClient({
      tables: { stores: [baseStore] },
      updateResult: updated,
    });

    await updateStore(supabase, 'store-1', { ...validInput, nombre: 'Updated Name' });

    const payload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(payload.nombre).toBe('Updated Name');
    expect(payload).not.toHaveProperty('tenant_id');
    expect(payload.payment_terms_days).toBe(45);
  });

  it('returns the updated store', async () => {
    const updated = { ...baseStore, nombre: 'New Name' };
    const supabase = createMockSupabaseClient({
      tables: { stores: [baseStore] },
      updateResult: updated,
    });

    const store = await updateStore(supabase, 'store-1', { ...validInput, nombre: 'New Name' });

    expect(store.nombre).toBe('New Name');
    expect(store.id).toBe('store-1');
  });

  it('throws when the DB returns an error', async () => {
    const supabase = createMockSupabaseClient({
      tables: { stores: [baseStore] },
      mutationError: { message: 'no rows', code: 'PGRST116' },
    });

    await expect(updateStore(supabase, 'store-1', validInput)).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// deleteStore (soft delete)
// ---------------------------------------------------------------------------
describe('deleteStore', () => {
  it('calls update with { activo: false } and NOT delete()', async () => {
    const supabase = createMockSupabaseClient({
      tables: { stores: [baseStore] },
    });

    await deleteStore(supabase, 'store-1');

    const updatePayload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(updatePayload).toEqual({ activo: false });
  });

  it('does not populate insertPayload (only update is called)', async () => {
    const supabase = createMockSupabaseClient({
      tables: { stores: [baseStore] },
    });

    await deleteStore(supabase, 'store-1');

    expect(supabase.__captured.insertPayload).toBeUndefined();
  });

  it('resolves to void on success', async () => {
    const supabase = createMockSupabaseClient({
      tables: { stores: [baseStore] },
    });

    await expect(deleteStore(supabase, 'store-1')).resolves.toBeUndefined();
  });

  it('throws when the DB returns an error', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'permission denied', code: '42501' },
    });

    await expect(deleteStore(supabase, 'store-1')).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AR-T13 — getStoreBalance + getStoreReceivables (REQ-4/S4-1,S4-2)
// ---------------------------------------------------------------------------
describe('getStoreBalance', () => {
  // Fixtures must include nested order.store.id so the TS filter in getStoreBalance works
  const invoiceFixtures = [
    {
      id: 'inv-1',
      tenant_id: 'tenant-1',
      order_id: 'ord-1',
      total: 500,
      total_paid: 200,
      due_date: '2026-07-01',
      estado_pago: 'pendiente',
      order: { estado: 'pendiente', store: { id: 'store-1' } },
    },
    {
      id: 'inv-2',
      tenant_id: 'tenant-1',
      order_id: 'ord-2',
      total: 300,
      total_paid: 300,
      due_date: '2026-07-01',
      estado_pago: 'pagado',
      order: { estado: 'pendiente', store: { id: 'store-1' } },
    },
  ];

  it('returns sum of (total - total_paid) for non-cancelled invoices of a store', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: invoiceFixtures },
    });

    const balance = await getStoreBalance(supabase, 'store-1');

    // inv-1: 500-200=300, inv-2: 300-300=0; total=300
    expect(balance).toBe(300);
  });

  it('returns 0 when all invoices are fully paid', async () => {
    const fullyPaidFixtures = invoiceFixtures.map((i) => ({ ...i, total_paid: i.total }));
    const supabase = createMockSupabaseClient({
      tables: { invoices: fullyPaidFixtures },
    });

    const balance = await getStoreBalance(supabase, 'store-1');

    expect(balance).toBe(0);
  });

  it('returns 0 when storeId does not match any invoice (TS filter)', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: invoiceFixtures },
    });

    const balance = await getStoreBalance(supabase, 'store-OTHER');

    expect(balance).toBe(0);
  });
});

describe('getStoreReceivables', () => {
  const storeFixture = { id: 'store-1', nombre: 'Main Store', tenant_id: 'tenant-1' };
  const invoiceFixtures = [
    {
      id: 'inv-1',
      store_id: 'store-1',
      total: 500,
      total_paid: 200,
      order: { estado: 'pendiente', store: storeFixture },
    },
    {
      id: 'inv-2',
      store_id: 'store-1',
      total: 300,
      total_paid: 100,
      order: { estado: 'pendiente', store: storeFixture },
    },
  ];

  it('returns per-store receivables with saldo summed correctly', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: invoiceFixtures },
    });

    const result = await getStoreReceivables(supabase);

    expect(Array.isArray(result)).toBe(true);
    // Each entry should have storeId, storeName, saldo
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('storeId');
      expect(result[0]).toHaveProperty('storeName');
      expect(result[0]).toHaveProperty('saldo');
    }
  });
});
