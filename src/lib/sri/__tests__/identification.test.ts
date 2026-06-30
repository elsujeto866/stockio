/**
 * Unit tests for SRI identification helpers.
 * Pure — no I/O, no side effects.
 * Safe to run in jsdom or node without a DB connection.
 *
 * Covers REQ-3a (cédula módulo-10), REQ-3b (RUC 13-digit),
 * and REQ-3e (consumidor final edge case).
 */

import { describe, it, expect } from 'vitest';
import { isValidCedula, isValidRuc } from '@/lib/sri/identification';

// ---------------------------------------------------------------------------
// isValidCedula — valid cases
// ---------------------------------------------------------------------------
describe('isValidCedula — valid cases', () => {
  it('Scenario 3.1 — accepts a known-valid cédula (1713175071)', () => {
    expect(isValidCedula('1713175071')).toBe(true);
  });

  it('accepts a valid cédula with province code 01 (lower bound)', () => {
    // Province 01, third digit 0 (< 6), valid módulo-10 checksum
    expect(isValidCedula('0102068723')).toBe(true);
  });

  it('accepts a valid cédula with province code 24 (upper bound)', () => {
    // Province 24, third digit 0 (< 6), valid módulo-10 checksum
    expect(isValidCedula('2402068726')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidCedula — rejection cases
// ---------------------------------------------------------------------------
describe('isValidCedula — rejection cases', () => {
  it('Scenario 3.2 — rejects a cédula that fails módulo-10 (1234567890)', () => {
    expect(isValidCedula('1234567890')).toBe(false);
  });

  it('rejects when province code is 00', () => {
    expect(isValidCedula('0013175071')).toBe(false);
  });

  it('rejects when province code is 25', () => {
    expect(isValidCedula('2513175071')).toBe(false);
  });

  it('rejects when third digit is >= 6 (natural-person discriminator)', () => {
    // '1763175071': province 17, third digit 6 → fails
    expect(isValidCedula('1763175071')).toBe(false);
  });

  it('rejects strings shorter than 10 digits', () => {
    expect(isValidCedula('123456789')).toBe(false);
  });

  it('rejects strings longer than 10 digits', () => {
    expect(isValidCedula('12345678901')).toBe(false);
  });

  it('rejects strings with non-numeric characters', () => {
    expect(isValidCedula('171317507X')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidCedula('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidRuc — valid cases
// ---------------------------------------------------------------------------
describe('isValidRuc — valid cases', () => {
  it('accepts exactly 13 numeric digits', () => {
    expect(isValidRuc('1713175071001')).toBe(true);
  });

  it('Scenario 3e edge — 9999999999999 (consumidor final) passes isValidRuc', () => {
    expect(isValidRuc('9999999999999')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidRuc — rejection cases
// ---------------------------------------------------------------------------
describe('isValidRuc — rejection cases', () => {
  it('rejects 11 numeric digits', () => {
    expect(isValidRuc('17131750710')).toBe(false);
  });

  it('rejects 12 numeric digits', () => {
    expect(isValidRuc('171317507100')).toBe(false);
  });

  it('rejects 14 numeric digits', () => {
    expect(isValidRuc('17131750710011')).toBe(false);
  });

  it('rejects non-numeric characters', () => {
    expect(isValidRuc('171317507100X')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRuc('')).toBe(false);
  });
});
