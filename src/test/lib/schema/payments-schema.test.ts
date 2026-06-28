/**
 * AR-T7 — Unit tests for RecordPaymentSchema.
 *
 * Strict TDD — RED PHASE: written before payments.ts schema exists.
 * Pure Zod validation — no I/O, no side effects.
 *
 * Covers: REQ-2/S2-5 (shape validation layer)
 */

import { describe, it, expect } from 'vitest';
import { RecordPaymentSchema } from '@/lib/schema/payments';

const VALID_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';

// ---------------------------------------------------------------------------
// Valid inputs
// ---------------------------------------------------------------------------
describe('RecordPaymentSchema — valid inputs', () => {
  it('parses a valid full object', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: VALID_UUID,
      amount: 300,
      fecha: '2026-06-28',
      notas: 'Pago parcial',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoiceId).toBe(VALID_UUID);
      expect(result.data.amount).toBe(300);
      expect(result.data.fecha).toBe('2026-06-28');
      expect(result.data.notas).toBe('Pago parcial');
    }
  });

  it('parses a valid minimal object (only invoiceId + amount)', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: VALID_UUID,
      amount: 100,
    });
    expect(result.success).toBe(true);
  });

  it('amount coerces string "300" to number 300', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: VALID_UUID,
      amount: '300',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(300);
    }
  });

  it('fecha="2026-06-28" passes as ISO date', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: VALID_UUID,
      amount: 50,
      fecha: '2026-06-28',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fecha).toBe('2026-06-28');
    }
  });

  it('fecha="" is preprocessed to null', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: VALID_UUID,
      amount: 50,
      fecha: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fecha).toBeNull();
    }
  });

  it('notas="" transforms to null', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: VALID_UUID,
      amount: 50,
      notas: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notas).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid inputs
// ---------------------------------------------------------------------------
describe('RecordPaymentSchema — invalid inputs', () => {
  it('amount="0" is rejected (must be positive)', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: VALID_UUID,
      amount: '0',
    });
    expect(result.success).toBe(false);
  });

  it('amount="-5" is rejected (must be positive)', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: VALID_UUID,
      amount: '-5',
    });
    expect(result.success).toBe(false);
  });

  it('invoiceId="not-uuid" is rejected', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: 'not-uuid',
      amount: 100,
    });
    expect(result.success).toBe(false);
  });

  it('notas exceeding 500 chars is rejected', () => {
    const result = RecordPaymentSchema.safeParse({
      invoiceId: VALID_UUID,
      amount: 100,
      notas: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
