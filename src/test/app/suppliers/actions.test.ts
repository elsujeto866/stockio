/**
 * Unit tests for supplier Server Actions.
 *
 * Verifies the action wire-up:
 *   parse → seam call → revalidatePath → redirect
 *   invalid parse → fieldErrors returned
 *   seam throws → error returned
 *
 * Mocks: next/navigation, next/cache, @/lib/supabase/server,
 *        @/lib/auth/get-user, @/lib/data/suppliers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/data/suppliers', () => ({
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deactivateSupplier: vi.fn(),
}));

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import {
  createSupplier,
  updateSupplier,
  deactivateSupplier,
} from '@/lib/data/suppliers';
import {
  createSupplierAction,
  updateSupplierAction,
  deactivateSupplierAction,
} from '@/app/(app)/suppliers/actions';
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

function validSupplierFormData(): FormData {
  const fd = new FormData();
  fd.set('nombre', 'Proveedor Test');
  return fd;
}

// ---------------------------------------------------------------------------
// createSupplierAction
// ---------------------------------------------------------------------------
describe('createSupplierAction', () => {
  it('returns fieldErrors when nombre is missing', async () => {
    const fd = new FormData();
    // nombre absent → Zod rejects

    const result = await createSupplierAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(createSupplier).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('calls createSupplier with parsed data and redirects on success', async () => {
    vi.mocked(createSupplier).mockResolvedValue({} as never);

    const fd = validSupplierFormData();
    fd.set('contacto', 'María López');
    await createSupplierAction(null, fd);

    expect(createSupplier).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ nombre: 'Proveedor Test', contacto: 'María López' })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/suppliers');
    expect(redirect).toHaveBeenCalledWith('/suppliers');
  });

  it('returns fieldErrors for invalid email', async () => {
    const fd = validSupplierFormData();
    fd.set('email', 'notanemail');

    const result = await createSupplierAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(result?.fieldErrors?.email).toBeDefined();
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it('calls requireUser to guard the action', async () => {
    vi.mocked(createSupplier).mockResolvedValue({} as never);

    await createSupplierAction(null, validSupplierFormData());

    expect(requireUser).toHaveBeenCalledOnce();
  });

  it('returns error when seam throws', async () => {
    vi.mocked(createSupplier).mockRejectedValue(new Error('DB error'));

    const result = await createSupplierAction(null, validSupplierFormData());

    expect(result).toHaveProperty('error', 'DB error');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('surfaces Postgres error message from plain PostgrestError object', async () => {
    vi.mocked(createSupplier).mockRejectedValue({
      message: 'duplicate key value violates unique constraint',
      code: '23505',
    });

    const result = await createSupplierAction(null, validSupplierFormData());

    expect(result).toHaveProperty('error', 'duplicate key value violates unique constraint');
  });
});

// ---------------------------------------------------------------------------
// updateSupplierAction
// ---------------------------------------------------------------------------
describe('updateSupplierAction', () => {
  it('returns error when supplier id is missing', async () => {
    const fd = validSupplierFormData();
    // no id field

    const result = await updateSupplierAction(null, fd);

    expect(result).toHaveProperty('error');
    expect(updateSupplier).not.toHaveBeenCalled();
  });

  it('returns fieldErrors for invalid data', async () => {
    const fd = new FormData();
    fd.set('id', 'supplier-1');
    // nombre missing

    const result = await updateSupplierAction(null, fd);

    expect(result).toHaveProperty('fieldErrors');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('calls updateSupplier with id + parsed data, then redirects', async () => {
    vi.mocked(updateSupplier).mockResolvedValue({} as never);

    const fd = validSupplierFormData();
    fd.set('id', 'supplier-1');
    fd.set('nombre', 'Proveedor Actualizado');

    await updateSupplierAction(null, fd);

    expect(updateSupplier).toHaveBeenCalledWith(
      mockClient,
      'supplier-1',
      expect.objectContaining({ nombre: 'Proveedor Actualizado' })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/suppliers');
    expect(redirect).toHaveBeenCalledWith('/suppliers');
  });

  it('returns error when seam throws', async () => {
    vi.mocked(updateSupplier).mockRejectedValue(new Error('not found'));

    const fd = validSupplierFormData();
    fd.set('id', 'supplier-1');

    const result = await updateSupplierAction(null, fd);

    expect(result).toHaveProperty('error', 'not found');
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deactivateSupplierAction
// ---------------------------------------------------------------------------
describe('deactivateSupplierAction', () => {
  it('calls deactivateSupplier (soft-delete seam) with the given id', async () => {
    vi.mocked(deactivateSupplier).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', 'supplier-1');

    await deactivateSupplierAction(fd);

    expect(deactivateSupplier).toHaveBeenCalledWith(mockClient, 'supplier-1');
  });

  it('revalidates and redirects after deactivate', async () => {
    vi.mocked(deactivateSupplier).mockResolvedValue(undefined);

    const fd = new FormData();
    fd.set('id', 'supplier-1');

    await deactivateSupplierAction(fd);

    expect(revalidatePath).toHaveBeenCalledWith('/suppliers');
    expect(redirect).toHaveBeenCalledWith('/suppliers');
  });
});
