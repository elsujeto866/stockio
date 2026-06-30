/**
 * Unit tests for SRI IVA backward-derivation helper.
 * Pure — no I/O, no side effects.
 *
 * Covers REQ-5: IVA math identity.
 *   base = round(total / 1.15, 2)
 *   iva  = total - base
 *   base + iva === total (exact numeric equality)
 */

import { describe, it, expect } from 'vitest';
import { computeIvaInclusive } from '@/lib/sri/iva';

describe('computeIvaInclusive', () => {
  it('Scenario 5.1 — round total: 115.00 → subtotal=100.00, iva=15.00', () => {
    const { subtotal, iva } = computeIvaInclusive(115.0);
    expect(subtotal).toBe(100.0);
    expect(iva).toBe(15.0);
  });

  it('Scenario 5.2 — non-round total: 23.00 → subtotal=20.00, iva=3.00', () => {
    const { subtotal, iva } = computeIvaInclusive(23.0);
    expect(subtotal).toBe(20.0);
    expect(iva).toBe(3.0);
  });

  it('Scenario 5.3 — identity holds: subtotal + iva === total for arbitrary positive totals', () => {
    const totals = [1.0, 10.5, 57.23, 115.0, 200.0, 999.99];
    for (const total of totals) {
      const { subtotal, iva } = computeIvaInclusive(total);
      expect(subtotal + iva).toBeCloseTo(total, 10);
    }
  });

  it('identity holds specifically for non-round division results', () => {
    // 100 / 1.15 = 86.9565... rounds to 86.96; iva = 100 - 86.96 = 13.04
    const { subtotal, iva } = computeIvaInclusive(100.0);
    expect(subtotal).toBe(86.96);
    expect(iva).toBe(13.04);
    expect(subtotal + iva).toBeCloseTo(100.0, 10);
  });
});
