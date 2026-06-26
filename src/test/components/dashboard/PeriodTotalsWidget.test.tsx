/**
 * Unit tests for PeriodTotalsWidget.
 *
 * Verifies:
 *  - period label is rendered
 *  - total sales (computed from orders, cancelado excluded) is displayed
 *  - order count is displayed
 *  - low-stock count is displayed
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeriodTotalsWidget } from '@/components/dashboard/PeriodTotalsWidget';
import type { OrderListItem } from '@/lib/data/orders';
import { formatCurrency } from '@/lib/format';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeOrder(id: string, estado: 'pendiente' | 'entregado' | 'cancelado', total: number | null): OrderListItem {
  return {
    id,
    tenant_id: 't1',
    store_id: 's1',
    fecha: '2026-06-10',
    estado,
    total,
    notas: null,
    created_at: '2026-06-10T00:00:00Z',
    store: { nombre: 'Store' },
  };
}

const sampleOrders: OrderListItem[] = [
  makeOrder('o1', 'pendiente', 100),
  makeOrder('o2', 'entregado', 200),
  makeOrder('o3', 'cancelado', 999),   // excluded from totals
];

const period = { from: '2026-06-01', to: '2026-06-26', label: 'June 2026' };

describe('PeriodTotalsWidget', () => {
  it('renders the period label', () => {
    render(<PeriodTotalsWidget orders={sampleOrders} lowStockCount={3} period={period} />);
    expect(screen.getByText('June 2026')).toBeInTheDocument();
  });

  it('renders the total sales excluding cancelado orders', () => {
    render(<PeriodTotalsWidget orders={sampleOrders} lowStockCount={3} period={period} />);
    // 100 + 200 = 300 (cancelado 999 excluded)
    expect(screen.getByText(formatCurrency(300))).toBeInTheDocument();
  });

  it('renders the non-cancelado order count', () => {
    render(<PeriodTotalsWidget orders={sampleOrders} lowStockCount={3} period={period} />);
    // 2 non-cancelado orders (pendiente + entregado)
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders the low-stock count', () => {
    render(<PeriodTotalsWidget orders={sampleOrders} lowStockCount={3} period={period} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders $0.00 when all orders are cancelado', () => {
    const allCancelled = [makeOrder('o1', 'cancelado', 500)];
    render(<PeriodTotalsWidget orders={allCancelled} lowStockCount={0} period={period} />);
    expect(screen.getByText(formatCurrency(0))).toBeInTheDocument();
  });

  it('handles null totals gracefully (treats as 0)', () => {
    const nullTotalOrders = [makeOrder('o1', 'pendiente', null)];
    render(<PeriodTotalsWidget orders={nullTotalOrders} lowStockCount={0} period={period} />);
    expect(screen.getByText(formatCurrency(0))).toBeInTheDocument();
  });
});
