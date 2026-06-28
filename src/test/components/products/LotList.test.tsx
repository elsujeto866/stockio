/**
 * Unit tests for LotList component (S4-T22).
 *
 * Tests:
 *  S6-1: lot with past expiry_date shows 'Vencido' badge
 *  S6-1: lot expiring-soon shows 'Por vencer' badge
 *  S6-1: lot with future expiry_date (beyond alert window) shows 'Vigente' badge
 *  S6-2: lot with quantity = 0 shows zeroed lot (qty 0 displayed — not filtered out)
 *  S6-3: lot with null expiry_date shows 'Sin fecha' badge, never expired/expiring-soon
 *
 * Covers: REQ-6
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LotList } from '@/components/products/LotList';
import type { Lot } from '@/lib/data/lots';

// Fix 'today' to a stable date for all tests
const TODAY = '2026-06-27';
vi.mock('@/lib/utils/today', () => ({ getToday: () => TODAY }));

// Helper to build a lot with required fields
function makeLot(overrides: Partial<Lot> & { id: string }): Lot {
  return {
    tenant_id: 't-1',
    product_id: 'prod-1',
    purchase_id: null,
    lot_type: 'purchase',
    quantity: 10,
    received_date: '2026-01-01',
    expiry_date: null,
    batch_ref: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const ALERT_DAYS = 30;

describe('LotList (REQ-6)', () => {
  it('S6-1: shows "Vencido" badge for expired lot (expiry_date < today)', () => {
    const lots = [makeLot({ id: 'l1', expiry_date: '2026-06-01', quantity: 5 })];
    render(<LotList lots={lots} today={TODAY} alertDays={ALERT_DAYS} />);
    expect(screen.getByText(/vencido/i)).toBeInTheDocument();
  });

  it('S6-1: shows "Por vencer" badge for lot expiring within alertDays', () => {
    // TODAY=2026-06-27, alertDays=30 → threshold 2026-07-27. Expiry 2026-07-10 is within window.
    const lots = [makeLot({ id: 'l2', expiry_date: '2026-07-10', quantity: 5 })];
    render(<LotList lots={lots} today={TODAY} alertDays={ALERT_DAYS} />);
    expect(screen.getByText(/por vencer/i)).toBeInTheDocument();
  });

  it('S6-1: shows "Vigente" badge for lot beyond alert window', () => {
    // 2026-09-01 is > today + 30 days
    const lots = [makeLot({ id: 'l3', expiry_date: '2026-09-01', quantity: 5 })];
    render(<LotList lots={lots} today={TODAY} alertDays={ALERT_DAYS} />);
    expect(screen.getByText(/vigente/i)).toBeInTheDocument();
  });

  it('S6-2: renders zero-quantity lot (qty 0 shown, not hidden)', () => {
    const lots = [makeLot({ id: 'l4', expiry_date: '2026-09-01', quantity: 0 })];
    render(<LotList lots={lots} today={TODAY} alertDays={ALERT_DAYS} />);
    // Qty 0 lot is displayed (audit trail)
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('S6-3: shows "Sin fecha" badge for null expiry_date', () => {
    const lots = [makeLot({ id: 'l5', expiry_date: null, quantity: 8 })];
    render(<LotList lots={lots} today={TODAY} alertDays={ALERT_DAYS} />);
    expect(screen.getByText(/sin fecha/i)).toBeInTheDocument();
  });

  it('S6-3: null expiry_date lot never shows expired or expiring-soon', () => {
    const lots = [makeLot({ id: 'l6', expiry_date: null, quantity: 8 })];
    render(<LotList lots={lots} today={TODAY} alertDays={ALERT_DAYS} />);
    expect(screen.queryByText(/vencido/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/por vencer/i)).not.toBeInTheDocument();
  });

  it('renders each lot row with its quantity', () => {
    const lots = [
      makeLot({ id: 'l7', expiry_date: '2026-09-01', quantity: 15 }),
      makeLot({ id: 'l8', expiry_date: '2026-10-01', quantity: 20 }),
    ];
    render(<LotList lots={lots} today={TODAY} alertDays={ALERT_DAYS} />);
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('shows empty message when lots array is empty', () => {
    render(<LotList lots={[]} today={TODAY} alertDays={ALERT_DAYS} />);
    expect(screen.getByText(/no hay lotes/i)).toBeInTheDocument();
  });
});
