/**
 * Unit tests for store Server Actions.
 *
 * All logic lives in the seam/schema layers (already tested in WU-A).
 * These tests verify the action wire-up:
 *   parse → seam call → revalidatePath → redirect
 *   invalid parse → fieldErrors returned
 *   seam throws → error returned
 *
 * Mocks: next/navigation, next/cache, @/lib/supabase/server,
 *        @/lib/auth/get-user, @/lib/data/stores
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/data/stores', () => ({
  createStore: vi.fn(),
  updateStore: vi.fn(),
  deleteStore: vi.fn(),
}));

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { createStore, updateStore, deleteStore } from '@/lib/data/stores';
import {
  createStoreAction,
  updateStoreAction,
  deleteStoreAction,
} from '@/app/(app)/stores/actions';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const mockClient = {};
const mockUser = { id: 'user-1', email: 'test@example.com' } as User;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(
    mockClient as Awaited<ReturnType<typeof createClient>>
  );
  vi.mocked(requireUser).mockResolvedValue(mockUser);
});

function validStoreFormData(): FormData {
  const fd = new FormData();
  fd.set('nombre', 'Almacén Central');
  return fd;
}

// ---------------------------------------------------------------------------
// createStoreAction
// ---------------------------------------------------------------------------
describe('createStoreAction', () => {
  it('returns fieldErrors when nombre is missing', async () => {
    const fd = new FormData();
    // nombre absent → Zod rejects

    const result = await createStoreAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(createStore).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('calls createStore with parsed data and redirects on success', async () => {
    vi.mocked(createStore).mockResolvedValue({} as never);

    const fd = validStoreFormData();
    fd.set('contacto', 'Juan Pérez');
    await createStoreAction(null, fd);

    expect(createStore).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ nombre: 'Almacén Central', contacto: 'Juan Pérez' })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/stores');
    expect(redirect).toHaveBeenCalledWith('/stores');
  });

  it('returns error when seam throws', async () => {
    vi.mocked(createStore).mockRejectedValue(new Error('DB error'));

    const result = await createStoreAction(null, validStoreFormData());

    expect(result).toHaveProperty('error', 'DB error');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('surfaces real Postgres error message from a plain PostgrestError object', async () => {
    vi.mocked(createStore).mockRejectedValue({
      message: 'duplicate key value violates unique constraint "stores_nombre_key"',
      code: '23505',
    });

    const result = await createStoreAction(null, validStoreFormData());

    expect(result).toHaveProperty(
      'error',
      'duplicate key value violates unique constraint "stores_nombre_key"'
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it('calls requireUser to guard the action', async () => {
    vi.mocked(createStore).mockResolvedValue({} as never);

    await createStoreAction(null, validStoreFormData());

    expect(requireUser).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// updateStoreAction
// ---------------------------------------------------------------------------
describe('updateStoreAction', () => {
  it('returns error when store id is missing', async () => {
    const fd = validStoreFormData();
    // no id field

    const result = await updateStoreAction(null, fd);

    expect(result).toHaveProperty('error');
    expect(updateStore).not.toHaveBeenCalled();
  });

  it('returns fieldErrors for invalid data', async () => {
    const fd = new FormData();
    fd.set('id', 'store-1');
    // nombre missing

    const result = await updateStoreAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('calls updateStore with id + parsed data, then redirects', async () => {
    vi.mocked(updateStore).mockResolvedValue({} as never);

    const fd = validStoreFormData();
    fd.set('id', 'store-1');
    fd.set('nombre', 'Depósito Norte');

    await updateStoreAction(null, fd);

    expect(updateStore).toHaveBeenCalledWith(
      mockClient,
      'store-1',
      expect.objectContaining({ nombre: 'Depósito Norte' })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/stores');
    expect(redirect).toHaveBeenCalledWith('/stores');
  });

  it('returns error when seam throws', async () => {
    vi.mocked(updateStore).mockRejectedValue(new Error('not found'));

    const fd = validStoreFormData();
    fd.set('id', 'store-1');

    const result = await updateStoreAction(null, fd);

    expect(result).toHaveProperty('error', 'not found');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('surfaces real Postgres error message from a plain PostgrestError object', async () => {
    vi.mocked(updateStore).mockRejectedValue({
      message: 'violates foreign key constraint "stores_tenant_id_fkey"',
      code: '23503',
    });

    const fd = validStoreFormData();
    fd.set('id', 'store-1');

    const result = await updateStoreAction(null, fd);

    expect(result).toHaveProperty(
      'error',
      'violates foreign key constraint "stores_tenant_id_fkey"'
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteStoreAction
// ---------------------------------------------------------------------------
describe('deleteStoreAction', () => {
  it('calls deleteStore (soft-delete seam) with the given id', async () => {
    vi.mocked(deleteStore).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', 'store-1');

    await deleteStoreAction(fd);

    expect(deleteStore).toHaveBeenCalledWith(mockClient, 'store-1');
  });

  it('revalidates and redirects after delete', async () => {
    vi.mocked(deleteStore).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', 'store-1');

    await deleteStoreAction(fd);

    expect(revalidatePath).toHaveBeenCalledWith('/stores');
    expect(redirect).toHaveBeenCalledWith('/stores');
  });
});
