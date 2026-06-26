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
import { createStore, updateStore, deleteStore } from '@/lib/data/stores';

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
};

const validInput = {
  nombre: 'Tienda Centro',
  contacto: '555-1234',
  direccion: 'Av. Principal 123',
  telefono: '555-5678',
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

  it('insert payload contains the expected fields', async () => {
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
  it('sends the correct update payload (no tenant_id)', async () => {
    const updated = { ...baseStore, nombre: 'Updated Name' };
    const supabase = createMockSupabaseClient({
      tables: { stores: [baseStore] },
      updateResult: updated,
    });

    await updateStore(supabase, 'store-1', { ...validInput, nombre: 'Updated Name' });

    const payload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(payload.nombre).toBe('Updated Name');
    expect(payload).not.toHaveProperty('tenant_id');
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
