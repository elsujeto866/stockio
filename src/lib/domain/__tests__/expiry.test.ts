/**
 * Unit tests for expiry domain helpers.
 *
 * Pure — no I/O, no DB connection required.
 * Tests: computeExpiryDate, isExpired, isExpiringSoon, expiryStatus, sortByFEFO
 *
 * Covers: REQ-6, REQ-1
 */

import { describe, it, expect } from 'vitest';
import {
  computeExpiryDate,
  isExpired,
  isExpiringSoon,
  expiryStatus,
  sortByFEFO,
  type FEFOLot,
} from '@/lib/domain/expiry';

// ---------------------------------------------------------------------------
// computeExpiryDate
// ---------------------------------------------------------------------------
describe('computeExpiryDate', () => {
  it('returns computed date when shelf_life_days is set (S1-1: 90 days from 2026-01-01 → 2026-04-01)', () => {
    expect(computeExpiryDate('2026-01-01', 90)).toBe('2026-04-01');
  });

  it('returns null when shelf_life_days is null', () => {
    expect(computeExpiryDate('2026-01-01', null)).toBeNull();
  });

  it('falls back to today when receivedDate is null and shelf_life_days is set', () => {
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(today.getUTCDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const result = computeExpiryDate(null, 0);
    // 0 days from today == today
    expect(result).toBe(todayStr);
  });

  it('returns null when both receivedDate is null and shelf_life_days is null', () => {
    expect(computeExpiryDate(null, null)).toBeNull();
  });

  it('correctly adds 30 days across a month boundary', () => {
    // 2026-01-15 + 30 days = 2026-02-14
    expect(computeExpiryDate('2026-01-15', 30)).toBe('2026-02-14');
  });

  it('correctly adds days across a year boundary', () => {
    // 2025-12-01 + 60 days = 2026-01-30
    expect(computeExpiryDate('2025-12-01', 60)).toBe('2026-01-30');
  });
});

// ---------------------------------------------------------------------------
// isExpired
// ---------------------------------------------------------------------------
describe('isExpired', () => {
  const today = '2026-06-27';

  it('returns true when expiry_date is in the past (7 days ago — S6-1 L1)', () => {
    expect(isExpired('2026-06-20', today)).toBe(true);
  });

  it('returns false when expiry_date is exactly today (boundary — not yet expired)', () => {
    // "expiry_date < current_date" per spec — today itself is NOT expired
    expect(isExpired('2026-06-27', today)).toBe(false);
  });

  it('returns false when expiry_date is in the future', () => {
    expect(isExpired('2026-07-10', today)).toBe(false);
  });

  it('returns false when expiry_date is null (NULL expiry NEVER expired — S6-3)', () => {
    expect(isExpired(null, today)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isExpiringSoon
// ---------------------------------------------------------------------------
describe('isExpiringSoon', () => {
  const today = '2026-06-27';
  const alertDays = 30;

  it('returns true when within the alert window (13 days away — S6-1 L2)', () => {
    expect(isExpiringSoon('2026-07-10', alertDays, today)).toBe(true);
  });

  it('returns false when expired (past today — S6-1 L1)', () => {
    // Already expired should not count as "expiring soon"
    expect(isExpiringSoon('2026-06-20', alertDays, today)).toBe(false);
  });

  it('returns false when beyond the alert window (66 days away — S6-1 L3)', () => {
    expect(isExpiringSoon('2026-09-01', alertDays, today)).toBe(false);
  });

  it('returns false when expiry_date is null (NULL NEVER triggers alert — S6-3)', () => {
    expect(isExpiringSoon(null, 365, today)).toBe(false);
  });

  it('returns true exactly on the alert threshold boundary (= alertDays)', () => {
    // today + 30 days = '2026-07-27': should be within window (<=)
    expect(isExpiringSoon('2026-07-27', alertDays, today)).toBe(true);
  });

  it('returns false one day beyond the threshold', () => {
    // today + 31 days = '2026-07-28': outside window
    expect(isExpiringSoon('2026-07-28', alertDays, today)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// expiryStatus
// ---------------------------------------------------------------------------
describe('expiryStatus', () => {
  const today = '2026-06-27';
  const alertDays = 30;

  it('returns "none" when expiry_date is null (S6-3)', () => {
    expect(expiryStatus(null, alertDays, today)).toBe('none');
  });

  it('returns "expired" when past expiry (S6-1 L1)', () => {
    expect(expiryStatus('2026-06-20', alertDays, today)).toBe('expired');
  });

  it('returns "expiring_soon" when within alert window (S6-1 L2)', () => {
    expect(expiryStatus('2026-07-10', alertDays, today)).toBe('expiring_soon');
  });

  it('returns "ok" when beyond alert window (S6-1 L3)', () => {
    expect(expiryStatus('2026-09-01', alertDays, today)).toBe('ok');
  });

  it('returns "expiring_soon" exactly on the boundary (= today + alertDays)', () => {
    expect(expiryStatus('2026-07-27', alertDays, today)).toBe('expiring_soon');
  });

  it('returns "expired" NOT "expiring_soon" when today is the expiry date boundary', () => {
    // expiry_date === today: NOT expired (spec: expiry_date < current_date)
    // AND NOT expiring_soon (spec: expiry_date >= current_date AND expiry_date <= current_date + alertDays)
    // So today itself should be "expiring_soon"
    expect(expiryStatus('2026-06-27', alertDays, today)).toBe('expiring_soon');
  });
});

// ---------------------------------------------------------------------------
// sortByFEFO
// ---------------------------------------------------------------------------
describe('sortByFEFO', () => {
  const makeLot = (overrides: Partial<FEFOLot>): FEFOLot => ({
    id: 'lot-default',
    expiry_date: null,
    received_date: '2026-01-01',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  it('sorts lots with earlier expiry first', () => {
    const lots = [
      makeLot({ id: 'L2', expiry_date: '2026-08-01' }),
      makeLot({ id: 'L1', expiry_date: '2026-06-01' }),
    ];
    const sorted = sortByFEFO(lots);
    expect(sorted[0].id).toBe('L1');
    expect(sorted[1].id).toBe('L2');
  });

  it('places NULL-expiry lots last (NULLS LAST — S2-4)', () => {
    const lots = [
      makeLot({ id: 'LNull', expiry_date: null }),
      makeLot({ id: 'L1', expiry_date: '2026-06-01' }),
    ];
    const sorted = sortByFEFO(lots);
    expect(sorted[0].id).toBe('L1');
    expect(sorted[1].id).toBe('LNull');
  });

  it('uses received_date as tiebreaker when expiry_dates are equal', () => {
    const lots = [
      makeLot({ id: 'L2', expiry_date: '2026-08-01', received_date: '2026-02-01' }),
      makeLot({ id: 'L1', expiry_date: '2026-08-01', received_date: '2026-01-01' }),
    ];
    const sorted = sortByFEFO(lots);
    expect(sorted[0].id).toBe('L1');
    expect(sorted[1].id).toBe('L2');
  });

  it('uses created_at as final tiebreaker when expiry and received are equal', () => {
    const lots = [
      makeLot({
        id: 'L2',
        expiry_date: '2026-08-01',
        received_date: '2026-01-01',
        created_at: '2026-01-01T12:00:00Z',
      }),
      makeLot({
        id: 'L1',
        expiry_date: '2026-08-01',
        received_date: '2026-01-01',
        created_at: '2026-01-01T08:00:00Z',
      }),
    ];
    const sorted = sortByFEFO(lots);
    expect(sorted[0].id).toBe('L1');
    expect(sorted[1].id).toBe('L2');
  });

  it('places multiple NULLs after all dated lots, ordered by received_date among themselves', () => {
    const lots = [
      makeLot({ id: 'NB', expiry_date: null, received_date: '2026-02-01' }),
      makeLot({ id: 'NA', expiry_date: null, received_date: '2026-01-01' }),
      makeLot({ id: 'L1', expiry_date: '2026-06-01' }),
    ];
    const sorted = sortByFEFO(lots);
    expect(sorted[0].id).toBe('L1');
    expect(sorted[1].id).toBe('NA');
    expect(sorted[2].id).toBe('NB');
  });

  it('does not mutate the original array', () => {
    const lots = [
      makeLot({ id: 'LB', expiry_date: '2026-09-01' }),
      makeLot({ id: 'LA', expiry_date: '2026-06-01' }),
    ];
    const original = [...lots];
    sortByFEFO(lots);
    expect(lots[0].id).toBe(original[0].id);
  });
});
