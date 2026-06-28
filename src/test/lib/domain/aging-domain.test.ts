/**
 * AR-T5 — Unit tests for aging domain helpers.
 *
 * Strict TDD — RED PHASE: written before aging.ts exists.
 * Pure functions — no I/O, no side effects.
 *
 * Covers: REQ-5/S5-1..S5-8 — all 8 boundary days.
 * Also covers: outstanding() rounding + floor-0; NULL dueDate guard.
 */

import { describe, it, expect } from 'vitest';
import { agingBucket, outstanding } from '@/lib/domain/aging';

// ---------------------------------------------------------------------------
// agingBucket — all 8 spec boundary days
// ---------------------------------------------------------------------------
describe('agingBucket — boundary cases (S5-1..S5-8)', () => {
  it('S5-1: dpd=0, due today → current', () => {
    expect(agingBucket('2026-06-28', '2026-06-28')).toBe('current');
  });

  it('S5-2: dpd=1 → 1-30', () => {
    expect(agingBucket('2026-06-27', '2026-06-28')).toBe('1-30');
  });

  it('S5-3: dpd=30 → 1-30', () => {
    expect(agingBucket('2026-05-29', '2026-06-28')).toBe('1-30');
  });

  it('S5-4: dpd=31 → 31-60', () => {
    expect(agingBucket('2026-05-28', '2026-06-28')).toBe('31-60');
  });

  it('S5-5: dpd=60 → 31-60', () => {
    expect(agingBucket('2026-04-29', '2026-06-28')).toBe('31-60');
  });

  it('S5-6: dpd=61 → 61-90', () => {
    expect(agingBucket('2026-04-28', '2026-06-28')).toBe('61-90');
  });

  it('S5-7: dpd=90 → 61-90', () => {
    expect(agingBucket('2026-03-30', '2026-06-28')).toBe('61-90');
  });

  it('S5-8: dpd=91 → 90+', () => {
    expect(agingBucket('2026-03-29', '2026-06-28')).toBe('90+');
  });

  it('dpd<0 (due in future) → current', () => {
    expect(agingBucket('2026-07-05', '2026-06-28')).toBe('current');
  });
});

// ---------------------------------------------------------------------------
// agingBucket — NULL dueDate guard (D3)
// ---------------------------------------------------------------------------
describe('agingBucket — NULL dueDate guard', () => {
  it('null dueDate returns current (does not throw)', () => {
    expect(agingBucket(null, '2026-06-28')).toBe('current');
  });
});

// ---------------------------------------------------------------------------
// outstanding — rounding + floor-0
// ---------------------------------------------------------------------------
describe('outstanding()', () => {
  it('outstanding(750, 250) → 500', () => {
    expect(outstanding(750, 250)).toBe(500);
  });

  it('outstanding(500, 500) → 0 (fully paid)', () => {
    expect(outstanding(500, 500)).toBe(0);
  });

  it('outstanding rounds to 2 decimal places', () => {
    expect(outstanding(100.005, 0)).toBeCloseTo(100.01, 2);
  });

  it('outstanding is floored at 0 (never negative)', () => {
    // Should not happen in valid state, but guard against numeric drift
    expect(outstanding(100, 100.001)).toBe(0);
  });

  it('outstanding(0, 0) → 0', () => {
    expect(outstanding(0, 0)).toBe(0);
  });
});
