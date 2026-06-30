/**
 * Unit tests for TenantEmisorSchema.
 * Pure — no I/O, no side effects.
 * Safe to run in jsdom or node.
 */

import { describe, it, expect } from 'vitest';
import { TenantEmisorSchema } from '@/lib/schema/tenants';

// ---------------------------------------------------------------------------
// TenantEmisorSchema — valid input
// ---------------------------------------------------------------------------
describe('TenantEmisorSchema — valid input', () => {
  it('accepts a valid 13-digit RUC', () => {
    const result = TenantEmisorSchema.safeParse({ ruc: '0992234789001' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ruc).toBe('0992234789001');
    }
  });

  it('defaults estab to "001" when omitted', () => {
    const result = TenantEmisorSchema.safeParse({ ruc: '0992234789001' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estab).toBe('001');
    }
  });

  it('defaults pto_emi to "001" when omitted', () => {
    const result = TenantEmisorSchema.safeParse({ ruc: '0992234789001' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pto_emi).toBe('001');
    }
  });

  it('accepts explicit estab and pto_emi values', () => {
    const result = TenantEmisorSchema.safeParse({
      ruc: '0992234789001',
      estab: '002',
      pto_emi: '003',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estab).toBe('002');
      expect(result.data.pto_emi).toBe('003');
    }
  });
});

// ---------------------------------------------------------------------------
// TenantEmisorSchema — rejection
// ---------------------------------------------------------------------------
describe('TenantEmisorSchema — rejection', () => {
  it('rejects RUC with 9 digits (too short)', () => {
    const result = TenantEmisorSchema.safeParse({ ruc: '123456789' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.ruc).toBeDefined();
    }
  });

  it('rejects empty RUC', () => {
    const result = TenantEmisorSchema.safeParse({ ruc: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.ruc).toBeDefined();
    }
  });

  it('rejects RUC with non-numeric characters', () => {
    const result = TenantEmisorSchema.safeParse({ ruc: '09922347890AB' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.ruc).toBeDefined();
    }
  });

  it('rejects RUC with 14 digits (too long)', () => {
    const result = TenantEmisorSchema.safeParse({ ruc: '09922347890011' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.ruc).toBeDefined();
    }
  });

  it('rejects missing RUC (undefined)', () => {
    const result = TenantEmisorSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.ruc).toBeDefined();
    }
  });
});
