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
