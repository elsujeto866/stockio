/**
 * Unit tests for format helpers.
 * Pure functions — no I/O.
 */

import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent } from '@/lib/format';

describe('formatCurrency', () => {
  it('formats a positive number as USD currency', () => {
    expect(formatCurrency(99.5)).toBe('$99.50');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
});

describe('formatPercent', () => {
  it('formats a positive number with 1 decimal and % suffix', () => {
    expect(formatPercent(40)).toBe('40.0%');
  });

  it('formats a fractional percent with 1 decimal', () => {
    expect(formatPercent(16.7)).toBe('16.7%');
  });

  it('formats zero percent', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('formats a negative percent', () => {
    expect(formatPercent(-25)).toBe('-25.0%');
  });

  it('rounds to 1 decimal place', () => {
    expect(formatPercent(33.333)).toBe('33.3%');
  });
});
