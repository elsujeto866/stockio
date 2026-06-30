/**
 * Unit tests for StoreInputSchema.
 * Pure — no I/O, no side effects.
 * Safe to run in jsdom or node.
 */

import { describe, it, expect } from 'vitest';
import { StoreInputSchema } from '@/lib/schema/stores';

// ---------------------------------------------------------------------------
// StoreInputSchema — valid input
// ---------------------------------------------------------------------------
describe('StoreInputSchema — valid input', () => {
  it('parses a fully populated valid store', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'Tienda Centro',
      contacto: 'Juan Perez',
      direccion: 'Av. Principal 123',
      telefono: '555-1234',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nombre).toBe('Tienda Centro');
      expect(result.data.contacto).toBe('Juan Perez');
      expect(result.data.direccion).toBe('Av. Principal 123');
      expect(result.data.telefono).toBe('555-1234');
    }
  });

  it('parses a store with only nombre (all optional fields absent)', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'Solo Nombre' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nombre).toBe('Solo Nombre');
    }
  });

  it('transforms null optional fields to null', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'Test Store',
      contacto: null,
      direccion: null,
      telefono: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contacto).toBeNull();
      expect(result.data.direccion).toBeNull();
      expect(result.data.telefono).toBeNull();
    }
  });

  it('transforms undefined optional fields to null', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'Test Store',
      contacto: undefined,
      direccion: undefined,
      telefono: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contacto).toBeNull();
      expect(result.data.direccion).toBeNull();
      expect(result.data.telefono).toBeNull();
    }
  });

  it('transforms empty string optional fields to null', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'Test Store',
      contacto: '',
      direccion: '',
      telefono: '',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contacto).toBeNull();
      expect(result.data.direccion).toBeNull();
      expect(result.data.telefono).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// StoreInputSchema — rejection
// ---------------------------------------------------------------------------
describe('StoreInputSchema — rejection', () => {
  it('rejects when nombre is absent', () => {
    const result = StoreInputSchema.safeParse({ contacto: 'X' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.nombre).toBeDefined();
    }
  });

  it('rejects when nombre is empty string', () => {
    const result = StoreInputSchema.safeParse({ nombre: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.nombre).toBeDefined();
    }
  });

  it('does NOT coerce numbers to strings — telefono as string passes', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'X', telefono: '123' });

    expect(result.success).toBe(true);
    if (result.success) {
      // telefono stays as the string '123', not coerced to number 123
      expect(typeof result.data.telefono).toBe('string');
      expect(result.data.telefono).toBe('123');
    }
  });

  it('rejects telefono when a number is passed (no numeric coercion)', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'X', telefono: 123 });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.telefono).toBeDefined();
    }
  });

  it('rejects contacto when a number is passed (no numeric coercion)', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'X', contacto: 42 });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.contacto).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// StoreInputSchema — payment_terms_days
// ---------------------------------------------------------------------------
describe('StoreInputSchema — payment_terms_days', () => {
  it('coerces the string "45" to the number 45', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'X', payment_terms_days: '45' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payment_terms_days).toBe(45);
    }
  });

  it('defaults to 30 when payment_terms_days is absent', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'X' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payment_terms_days).toBe(30);
    }
  });

  it('rejects a negative value', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'X', payment_terms_days: -1 });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.payment_terms_days).toBeDefined();
    }
  });

  it('accepts 0 (immediate payment)', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'X', payment_terms_days: 0 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payment_terms_days).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// StoreInputSchema — fiscal identifier fields (REQ-3a–3e)
// ---------------------------------------------------------------------------
describe('StoreInputSchema — fiscal identifier fields', () => {
  // ---- tipo_identificacion default ----

  it('defaults tipo_identificacion to 07 when absent', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'X' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tipo_identificacion).toBe('07');
    }
  });

  it('rejects tipo_identificacion value not in enum (e.g. "03")', () => {
    const result = StoreInputSchema.safeParse({ nombre: 'X', tipo_identificacion: '03' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.tipo_identificacion).toBeDefined();
    }
  });

  // ---- Cédula (tipo 05) — REQ-3a ----

  it('Scenario 3.1 — tipo=05, valid cédula → parse succeeds', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '05',
      numero_identificacion: '1713175071',
    });
    expect(result.success).toBe(true);
  });

  it('Scenario 3.2 — tipo=05, invalid cédula → parse error on numero_identificacion', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '05',
      numero_identificacion: '1234567890',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.numero_identificacion).toBeDefined();
    }
  });

  it('tipo=05, missing numero → parse error on numero_identificacion', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '05',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.numero_identificacion).toBeDefined();
    }
  });

  // ---- RUC (tipo 04) — REQ-3b ----

  it('Scenario 3.3 — tipo=04, 11-digit numero → parse error (expects 13)', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '04',
      numero_identificacion: '17131750710',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.numero_identificacion).toBeDefined();
    }
  });

  it('tipo=04, valid 13-digit RUC → parse succeeds', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '04',
      numero_identificacion: '1713175071001',
    });
    expect(result.success).toBe(true);
  });

  // ---- Consumidor Final (tipo 07) — REQ-3e ----

  it('Scenario 3.4 — tipo=07, empty numero → auto-fills 9999999999999 and CONSUMIDOR FINAL', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '07',
      numero_identificacion: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.numero_identificacion).toBe('9999999999999');
      expect(result.data.razon_social_comprobante).toBe('CONSUMIDOR FINAL');
    }
  });

  it('tipo=07, absent numero → auto-fills consumidor final values', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '07',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.numero_identificacion).toBe('9999999999999');
      expect(result.data.razon_social_comprobante).toBe('CONSUMIDOR FINAL');
    }
  });

  // ---- Pasaporte (tipo 06) — REQ-3c ----

  it('Scenario 3.5 — tipo=06, free-form string → parse succeeds', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '06',
      numero_identificacion: 'AB123456',
    });
    expect(result.success).toBe(true);
  });

  it('tipo=06, missing numero → parse error (non-empty required)', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '06',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.numero_identificacion).toBeDefined();
    }
  });

  // ---- Exterior (tipo 08) — REQ-3d ----

  it('tipo=08, any non-empty string → parse succeeds', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '08',
      numero_identificacion: 'PASSPORT-999',
    });
    expect(result.success).toBe(true);
  });

  it('tipo=08, missing numero → parse error (non-empty required)', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '08',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.numero_identificacion).toBeDefined();
    }
  });

  // ---- razon_social_comprobante ----

  it('razon_social_comprobante empty string transforms to null', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '04',
      numero_identificacion: '1713175071001',
      razon_social_comprobante: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.razon_social_comprobante).toBeNull();
    }
  });

  it('razon_social_comprobante present value is preserved', () => {
    const result = StoreInputSchema.safeParse({
      nombre: 'X',
      tipo_identificacion: '04',
      numero_identificacion: '1713175071001',
      razon_social_comprobante: 'Juan Pérez',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.razon_social_comprobante).toBe('Juan Pérez');
    }
  });
});
