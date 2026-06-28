/**
 * AR-T27 — BackfillNotice wiring tests for /receivables.
 *
 * Strict TDD — RED PHASE verified in WU6 before BackfillNotice was extended.
 *
 * Verifies:
 *   - BackfillNotice renders when show=true
 *   - BackfillNotice is hidden when show=false
 *   - Clicking dismiss sets localStorage key 'stockio:ar-backfill-notice-dismissed'
 *   - Re-render with show=true after dismiss → hidden (dismissed state persists)
 *   - Does NOT use 'stockio:backfill-notice-dismissed' (expiry-batches key — no cross-contamination)
 *
 * Covers: REQ-7/S7-3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BackfillNotice } from '@/components/shared/BackfillNotice';

const AR_STORAGE_KEY = 'stockio:ar-backfill-notice-dismissed';
const EXPIRY_STORAGE_KEY = 'stockio:backfill-notice-dismissed';
const AR_MESSAGE = 'Revisá los plazos de pago por tienda';

beforeEach(() => {
  localStorage.clear();
});

describe('BackfillNotice (AR) — show/hide', () => {
  it('renders when show=true and not dismissed', () => {
    render(
      <BackfillNotice
        show={true}
        storageKey={AR_STORAGE_KEY}
        message={AR_MESSAGE}
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(AR_MESSAGE))).toBeInTheDocument();
  });

  it('does not render when show=false', () => {
    render(
      <BackfillNotice
        show={false}
        storageKey={AR_STORAGE_KEY}
        message={AR_MESSAGE}
      />
    );

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hides when dismiss button is clicked', () => {
    render(
      <BackfillNotice
        show={true}
        storageKey={AR_STORAGE_KEY}
        message={AR_MESSAGE}
      />
    );

    const dismissBtn = screen.getByRole('button', { name: /descartar/i });
    fireEvent.click(dismissBtn);

    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('BackfillNotice (AR) — localStorage key', () => {
  it('sets AR storage key (not expiry-batches key) when dismissed', () => {
    render(
      <BackfillNotice
        show={true}
        storageKey={AR_STORAGE_KEY}
        message={AR_MESSAGE}
      />
    );

    const dismissBtn = screen.getByRole('button', { name: /descartar/i });
    fireEvent.click(dismissBtn);

    // AR key must be set
    expect(localStorage.getItem(AR_STORAGE_KEY)).toBe('true');

    // Expiry-batches key must NOT be set (no cross-contamination)
    expect(localStorage.getItem(EXPIRY_STORAGE_KEY)).toBeNull();
  });

  it('stays hidden on re-render when AR key is set in localStorage', () => {
    localStorage.setItem(AR_STORAGE_KEY, 'true');

    render(
      <BackfillNotice
        show={true}
        storageKey={AR_STORAGE_KEY}
        message={AR_MESSAGE}
      />
    );

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('expiry-batches notice still works with default key (backward compat)', () => {
    // When BackfillNotice is used without storageKey (expiry-batches usage),
    // it should use the default 'stockio:backfill-notice-dismissed' key
    render(<BackfillNotice show={true} />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: /descartar/i });
    fireEvent.click(dismissBtn);

    expect(localStorage.getItem(EXPIRY_STORAGE_KEY)).toBe('true');
    // AR key must NOT be affected
    expect(localStorage.getItem(AR_STORAGE_KEY)).toBeNull();
  });
});
