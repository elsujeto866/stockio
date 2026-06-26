/**
 * Unit tests for LowStockBadge.
 *
 * R6: badge renders when stock_actual < stock_minimo (strict <).
 *     Absent when equal (boundary) or above.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LowStockBadge } from '@/components/products/LowStockBadge';

describe('LowStockBadge', () => {
  it('renders the badge when stock_actual is strictly below stock_minimo', () => {
    render(<LowStockBadge product={{ stock_actual: 3, stock_minimo: 10 }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders when stock_actual is 0 and stock_minimo is 1 (extreme low)', () => {
    render(<LowStockBadge product={{ stock_actual: 0, stock_minimo: 1 }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('is ABSENT when stock_actual equals stock_minimo (boundary — not low)', () => {
    render(<LowStockBadge product={{ stock_actual: 10, stock_minimo: 10 }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is ABSENT when stock_actual is above stock_minimo', () => {
    render(<LowStockBadge product={{ stock_actual: 20, stock_minimo: 10 }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is ABSENT when both are zero (equal boundary)', () => {
    render(<LowStockBadge product={{ stock_actual: 0, stock_minimo: 0 }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('badge text indicates low stock', () => {
    render(<LowStockBadge product={{ stock_actual: 1, stock_minimo: 5 }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/low stock/i);
  });
});
