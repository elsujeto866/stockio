/**
 * Unit tests for SupplierInputSchema.
 *
 * Pure — no I/O, no side effects.
 * Key invariant: empty-string email must NOT trigger .email() validation.
 * Strategy: preprocess '' → undefined before .email().
 */

import { describe, it, expect } from 'vitest';
import { SupplierInputSchema } from '@/lib/schema/suppliers';

// ---------------------------------------------------------------------------
// Valid input
// ---------------------------------------------------------------------------
describe('SupplierInputSchema — valid input', () => {
  it('parses a fully populated valid supplier', () => {
    const result = SupplierInputSchema.safeParse({
      nombre: 'Proveedor Central',
      ruc: '20123456789',
      contacto: 'Ana García',
      telefono: '555-1234',
      email: 'ana@proveedor.com',
      notas: 'Notas del proveedor',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nombre).toBe('Proveedor Central');
    }
  });

  it('parses a supplier with only nombre (all optional fields absent)', () => {
    const result = SupplierInputSchema.safeParse({ nombre: 'Solo Nombre' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nombre).toBe('Solo Nombre');
    }
  });

  it('accepts a valid email', () => {
    const result = SupplierInputSchema.safeParse({
      nombre: 'Test',
      email: 'valid@example.com',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('valid@example.com');
    }
  });

  it('empty string email transforms to null (does NOT trip .email() validator)', () => {
    const result = SupplierInputSchema.safeParse({ nombre: 'Test', email: '' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it('omitted email passes and transforms to null', () => {
    const result = SupplierInputSchema.safeParse({ nombre: 'Test' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it('all optional fields omitted → all null in output', () => {
    const result = SupplierInputSchema.safeParse({ nombre: 'Test' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ruc).toBeNull();
      expect(result.data.contacto).toBeNull();
      expect(result.data.telefono).toBeNull();
      expect(result.data.email).toBeNull();
      expect(result.data.notas).toBeNull();
    }
  });

  it('transforms null optional fields to null', () => {
    const result = SupplierInputSchema.safeParse({
      nombre: 'Test Supplier',
      ruc: null,
      contacto: null,
      telefono: null,
      email: null,
      notas: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ruc).toBeNull();
      expect(result.data.contacto).toBeNull();
      expect(result.data.telefono).toBeNull();
      expect(result.data.email).toBeNull();
      expect(result.data.notas).toBeNull();
    }
  });

  it('transforms empty string optional fields to null (ruc, contacto, telefono, notas)', () => {
    const result = SupplierInputSchema.safeParse({
      nombre: 'Test Supplier',
      ruc: '',
      contacto: '',
      telefono: '',
      notas: '',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ruc).toBeNull();
      expect(result.data.contacto).toBeNull();
      expect(result.data.telefono).toBeNull();
      expect(result.data.notas).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Rejection
// ---------------------------------------------------------------------------
describe('SupplierInputSchema — rejection', () => {
  it('rejects when nombre is absent', () => {
    const result = SupplierInputSchema.safeParse({ contacto: 'X' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.nombre).toBeDefined();
    }
  });

  it('rejects when nombre is empty string', () => {
    const result = SupplierInputSchema.safeParse({ nombre: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.nombre).toBeDefined();
    }
  });

  it('rejects an invalid email', () => {
    const result = SupplierInputSchema.safeParse({
      nombre: 'Test',
      email: 'notanemail',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.email).toBeDefined();
    }
  });
});
