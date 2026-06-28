/**
 * Unit tests for StoreCard.
 *
 * Verifies:
 *  - nombre is visible
 *  - optional contacto/direccion/telefono are shown when present
 *  - optional fields are absent when null/undefined
 *  - Edit link has correct href
 *  - Delete button is present
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock Next.js Link to a plain anchor in jsdom.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Mock Server Action import so the RSC component can load in jsdom.
vi.mock('@/app/(app)/stores/actions', () => ({
  deleteStoreAction: vi.fn(),
  createStoreAction: vi.fn(),
  updateStoreAction: vi.fn(),
}));

import { StoreCard } from '@/components/stores/StoreCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseStore = {
  id: 'store-1',
  tenant_id: 't-1',
  nombre: 'Almacén Central',
  contacto: 'Juan Pérez',
  direccion: 'Av. Corrientes 1234',
  telefono: '+54 11 1234-5678',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  payment_terms_days: 30,
};

describe('StoreCard', () => {
  it('displays the store name', () => {
    render(<StoreCard store={baseStore} />);
    expect(screen.getByText('Almacén Central')).toBeInTheDocument();
  });

  it('displays contacto when present', () => {
    render(<StoreCard store={baseStore} />);
    expect(screen.getByText(/Juan Pérez/)).toBeInTheDocument();
  });

  it('displays direccion when present', () => {
    render(<StoreCard store={baseStore} />);
    expect(screen.getByText(/Av. Corrientes 1234/)).toBeInTheDocument();
  });

  it('displays telefono when present', () => {
    render(<StoreCard store={baseStore} />);
    expect(screen.getByText(/\+54 11 1234-5678/)).toBeInTheDocument();
  });

  it('does not render contacto section when null', () => {
    render(<StoreCard store={{ ...baseStore, contacto: null }} />);
    expect(screen.queryByText(/Juan Pérez/)).not.toBeInTheDocument();
  });

  it('does not render direccion section when null', () => {
    render(<StoreCard store={{ ...baseStore, direccion: null }} />);
    expect(screen.queryByText(/Av. Corrientes 1234/)).not.toBeInTheDocument();
  });

  it('does not render telefono section when null', () => {
    render(<StoreCard store={{ ...baseStore, telefono: null }} />);
    expect(screen.queryByText(/\+54 11 1234-5678/)).not.toBeInTheDocument();
  });

  it('contains an edit link pointing to /stores/[id]/edit', () => {
    render(<StoreCard store={baseStore} />);
    const editLink = screen.getByRole('link', { name: /edit/i });
    expect(editLink).toHaveAttribute('href', '/stores/store-1/edit');
  });

  it('contains a delete button', () => {
    render(<StoreCard store={baseStore} />);
    expect(screen.getByRole('button', { name: /eliminar/i })).toBeInTheDocument();
  });
});
