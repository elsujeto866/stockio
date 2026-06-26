/**
 * Unit tests for CreateInvoiceSchema and SetPaymentSchema.
 * Pure — no I/O, no DB connection required.
 */

import { describe, it, expect } from 'vitest';
import { CreateInvoiceSchema, SetPaymentSchema } from '@/lib/schema/invoices';

// RFC-compliant UUIDs for Zod v4 validation (version nibble 4, variant nibble 8)
const VALID_ORDER_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
const VALID_INVOICE_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// ---------------------------------------------------------------------------
// CreateInvoiceSchema
// ---------------------------------------------------------------------------
describe('CreateInvoiceSchema', () => {
  it('accepts a valid UUID orderId', () => {
    const result = CreateInvoiceSchema.safeParse({ orderId: VALID_ORDER_UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orderId).toBe(VALID_ORDER_UUID);
    }
  });

  it('rejects a non-UUID orderId', () => {
    const result = CreateInvoiceSchema.safeParse({ orderId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.orderId).toBeDefined();
    }
  });

  it('rejects an empty string orderId', () => {
    const result = CreateInvoiceSchema.safeParse({ orderId: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.orderId).toBeDefined();
    }
  });

  it('rejects when orderId is absent', () => {
    const result = CreateInvoiceSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.orderId).toBeDefined();
    }
  });

  it('rejects extra fields are not stripped by default (strict shape not required)', () => {
    // Zod by default strips unknown keys — extra fields do not cause failure
    const result = CreateInvoiceSchema.safeParse({
      orderId: VALID_ORDER_UUID,
      tenant_id: 'should-be-ignored',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SetPaymentSchema
// ---------------------------------------------------------------------------
describe('SetPaymentSchema', () => {
  it('accepts a valid id and estado "pagado"', () => {
    const result = SetPaymentSchema.safeParse({ id: VALID_INVOICE_UUID, estado: 'pagado' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(VALID_INVOICE_UUID);
      expect(result.data.estado).toBe('pagado');
    }
  });

  it('accepts a valid id and estado "pendiente"', () => {
    const result = SetPaymentSchema.safeParse({ id: VALID_INVOICE_UUID, estado: 'pendiente' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estado).toBe('pendiente');
    }
  });

  it('accepts null estado (clears payment status)', () => {
    const result = SetPaymentSchema.safeParse({ id: VALID_INVOICE_UUID, estado: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estado).toBeNull();
    }
  });

  it('accepts missing estado (optional field)', () => {
    const result = SetPaymentSchema.safeParse({ id: VALID_INVOICE_UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estado).toBeUndefined();
    }
  });

  it('rejects a non-UUID id', () => {
    const result = SetPaymentSchema.safeParse({ id: 'not-a-uuid', estado: 'pagado' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.id).toBeDefined();
    }
  });

  it('rejects when id is absent', () => {
    const result = SetPaymentSchema.safeParse({ estado: 'pagado' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.id).toBeDefined();
    }
  });

  it('rejects an invalid estado value', () => {
    const result = SetPaymentSchema.safeParse({ id: VALID_INVOICE_UUID, estado: 'unknown' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.estado).toBeDefined();
    }
  });
});
