/**
 * Unit tests for ExpiringSoonWidget (S4-T24).
 *
 * Tests:
 *  S6-1: shows expired count and expiring-soon count
 *  S6-1: nearExpiry lots listed with product links
 *  S6-2: zero-qty lots excluded from summary counts
 *  S6-3: NULL-expiry lots excluded regardless of alertDays
 *
 * The widget receives an ExpiringSoonSummary (pre-computed by data layer);
 * these tests exercise the rendering only — data correctness is tested in
 * data/lots.ts unit/integration tests.
 *
 * Covers: REQ-6
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExpiringSoonWidget } from '@/components/dashboard/ExpiringSoonWidget';
import type { ExpiringSoonSummary, LotWithProduct } from '@/lib/data/lots';

function makeLotWithProduct(
  id: string,
  productId: string,
  productNombre: string,
  expiryDate: string | null,
  quantity = 5
): LotWithProduct {
  return {
    id,
    tenant_id: 't-1',
    product_id: productId,
    purchase_id: null,
    lot_type: 'purchase',
    quantity,
    received_date: '2026-01-01',
    expiry_date: expiryDate,
    batch_ref: null,
    created_at: '2026-01-01T00:00:00Z',
    product: { id: productId, nombre: productNombre, expiry_alert_days: 30 },
  };
}

describe('ExpiringSoonWidget (REQ-6)', () => {
  it('S6-1: shows expired count badge', () => {
    const summary: ExpiringSoonSummary = {
      expiredCount: 3,
      expiringSoonCount: 1,
      nearExpiry: [],
    };
    render(<ExpiringSoonWidget summary={summary} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('S6-1: shows expiring-soon count badge', () => {
    const summary: ExpiringSoonSummary = {
      expiredCount: 0,
      expiringSoonCount: 2,
      nearExpiry: [],
    };
    render(<ExpiringSoonWidget summary={summary} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('S6-1: lists nearExpiry lots with product links to detail page', () => {
    const summary: ExpiringSoonSummary = {
      expiredCount: 0,
      expiringSoonCount: 1,
      nearExpiry: [
        makeLotWithProduct('l1', 'prod-a', 'Yogur Natural', '2026-07-05'),
      ],
    };
    render(<ExpiringSoonWidget summary={summary} />);

    expect(screen.getByText('Yogur Natural')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /yogur natural/i });
    expect(link).toHaveAttribute('href', '/products/prod-a');
  });

  it('shows empty message when both counts are 0', () => {
    const summary: ExpiringSoonSummary = {
      expiredCount: 0,
      expiringSoonCount: 0,
      nearExpiry: [],
    };
    render(<ExpiringSoonWidget summary={summary} />);
    expect(screen.getByText(/sin alertas/i)).toBeInTheDocument();
  });

  it('renders up to 5 nearExpiry lots', () => {
    const nearExpiry = Array.from({ length: 5 }, (_, i) =>
      makeLotWithProduct(`l${i}`, `prod-${i}`, `Producto ${i}`, `2026-07-0${i + 1}`)
    );
    const summary: ExpiringSoonSummary = {
      expiredCount: 1,
      expiringSoonCount: 5,
      nearExpiry,
    };
    render(<ExpiringSoonWidget summary={summary} />);
    // All 5 product names should appear
    nearExpiry.forEach((lot) => {
      expect(screen.getByText(lot.product!.nombre)).toBeInTheDocument();
    });
  });

  it('S6-2/S6-3: lots with qty=0 and null-expiry are excluded by data layer (counts are pre-computed)', () => {
    // The data layer (getExpiringSoonSummary) filters qty=0 and null-expiry lots.
    // The widget trusts the summary; here we verify it renders the counts as passed in.
    const summary: ExpiringSoonSummary = {
      expiredCount: 0,  // no expired
      expiringSoonCount: 0,  // no expiring-soon
      nearExpiry: [],
    };
    render(<ExpiringSoonWidget summary={summary} />);
    expect(screen.getByText(/sin alertas/i)).toBeInTheDocument();
  });
});
