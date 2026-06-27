/**
 * Unit tests for supplier data-seam.
 *
 * Uses the extended mock client — verifies:
 *  - createSupplier: insert payload omits tenant_id from input; tenant resolved via RPC
 *  - updateSupplier: update payload correct, no tenant_id
 *  - deactivateSupplier: calls update({activo:false}), NEVER .delete()
 *  - getSuppliers: filters by activo=true, orders by nombre
 *  - getSupplier: returns null when not found (does not throw)
 */

import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import {
  createSupplier,
  updateSupplier,
  deactivateSupplier,
  getSuppliers,
  getSupplier,
} from '@/lib/data/suppliers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseSupplier = {
  id: 'supplier-1',
  tenant_id: 'tenant-1',
  nombre: 'Proveedor Central',
  ruc: '20123456789',
  contacto: 'Ana García',
  telefono: '555-1234',
  email: 'ana@proveedor.com',
  notas: 'Proveedor principal',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
};

const validInput = {
  nombre: 'Proveedor Central',
  ruc: '20123456789',
  contacto: 'Ana García',
  telefono: '555-1234',
  email: 'ana@proveedor.com',
  notas: 'Proveedor principal',
};

// ---------------------------------------------------------------------------
// getSuppliers
// ---------------------------------------------------------------------------
describe('getSuppliers', () => {
  it('returns suppliers from the table', async () => {
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [baseSupplier] },
    });
    const result = await getSuppliers(supabase);
    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe('Proveedor Central');
  });

  it('returns empty array when no active suppliers', async () => {
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [] },
    });
    const result = await getSuppliers(supabase);
    expect(result).toHaveLength(0);
  });

  it('excludes inactive suppliers (activo=true filter is applied)', async () => {
    const inactiveSupplier = {
      ...baseSupplier,
      id: 'supplier-2',
      nombre: 'Proveedor Inactivo',
      activo: false,
    };
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [baseSupplier, inactiveSupplier] },
    });
    const result = await getSuppliers(supabase);
    // Regression guard: dropping `.eq('activo', true)` would leak the inactive row.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('supplier-1');
    expect(result.every((s) => s.activo === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSupplier
// ---------------------------------------------------------------------------
describe('getSupplier', () => {
  it('returns null when not found (does not throw)', async () => {
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [] },
    });
    const result = await getSupplier(supabase, 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('returns the supplier when found', async () => {
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [baseSupplier] },
    });
    const result = await getSupplier(supabase, 'supplier-1');
    expect(result?.id).toBe('supplier-1');
    expect(result?.nombre).toBe('Proveedor Central');
  });
});

// ---------------------------------------------------------------------------
// createSupplier
// ---------------------------------------------------------------------------
describe('createSupplier', () => {
  it('resolves tenant_id from get_tenant_id() RPC, not from user input', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: baseSupplier,
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    await createSupplier(supabase, validInput);

    const payload = supabase.__captured.insertPayload as Record<string, unknown>;
    expect(payload.tenant_id).toBe('tenant-1');
    expect(validInput).not.toHaveProperty('tenant_id');
  });

  it('insert payload contains the expected fields', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: baseSupplier,
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    await createSupplier(supabase, validInput);

    const payload = supabase.__captured.insertPayload as Record<string, unknown>;
    expect(payload.nombre).toBe('Proveedor Central');
    expect(payload.ruc).toBe('20123456789');
    expect(payload.contacto).toBe('Ana García');
  });

  it('returns the created supplier from the DB result', async () => {
    const supabase = createMockSupabaseClient({
      insertResult: baseSupplier,
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    const supplier = await createSupplier(supabase, validInput);

    expect(supplier.id).toBe('supplier-1');
    expect(supplier.nombre).toBe('Proveedor Central');
    expect(supplier.activo).toBe(true);
  });

  it('throws when get_tenant_id() fails (not authenticated)', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        get_tenant_id: () => ({
          data: null,
          error: { message: 'not found', code: '42883' },
        }),
      },
    });

    await expect(createSupplier(supabase, validInput)).rejects.toThrow(
      'Could not resolve tenant'
    );
  });

  it('throws when the DB insert returns an error', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'unique violation', code: '23505' },
      rpcs: {
        get_tenant_id: () => ({ data: 'tenant-1', error: null }),
      },
    });

    await expect(createSupplier(supabase, validInput)).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// updateSupplier
// ---------------------------------------------------------------------------
describe('updateSupplier', () => {
  it('sends the correct update payload (no tenant_id)', async () => {
    const updated = { ...baseSupplier, nombre: 'Updated Supplier' };
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [baseSupplier] },
      updateResult: updated,
    });

    await updateSupplier(supabase, 'supplier-1', {
      ...validInput,
      nombre: 'Updated Supplier',
    });

    const payload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(payload.nombre).toBe('Updated Supplier');
    expect(payload).not.toHaveProperty('tenant_id');
  });

  it('returns the updated supplier', async () => {
    const updated = { ...baseSupplier, nombre: 'New Name' };
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [baseSupplier] },
      updateResult: updated,
    });

    const supplier = await updateSupplier(supabase, 'supplier-1', {
      ...validInput,
      nombre: 'New Name',
    });

    expect(supplier.nombre).toBe('New Name');
    expect(supplier.id).toBe('supplier-1');
  });

  it('throws when the DB returns an error', async () => {
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [baseSupplier] },
      mutationError: { message: 'no rows', code: 'PGRST116' },
    });

    await expect(
      updateSupplier(supabase, 'supplier-1', validInput)
    ).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// deactivateSupplier (soft delete — NEVER hard delete)
// ---------------------------------------------------------------------------
describe('deactivateSupplier', () => {
  it('calls update with { activo: false } and NOT delete()', async () => {
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [baseSupplier] },
    });

    await deactivateSupplier(supabase, 'supplier-1');

    const updatePayload = supabase.__captured.updatePayload as Record<string, unknown>;
    expect(updatePayload).toEqual({ activo: false });
  });

  it('does not populate insertPayload (only update is called)', async () => {
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [baseSupplier] },
    });

    await deactivateSupplier(supabase, 'supplier-1');

    expect(supabase.__captured.insertPayload).toBeUndefined();
  });

  it('resolves to void on success', async () => {
    const supabase = createMockSupabaseClient({
      tables: { suppliers: [baseSupplier] },
    });

    await expect(deactivateSupplier(supabase, 'supplier-1')).resolves.toBeUndefined();
  });

  it('throws when the DB returns an error', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'permission denied', code: '42501' },
    });

    await expect(deactivateSupplier(supabase, 'supplier-1')).rejects.toBeDefined();
  });
});
