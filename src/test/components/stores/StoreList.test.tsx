/**
 * Unit tests for StoreList.
 *
 * Verifies:
 *  - Empty state renders when stores array is empty
 *  - List renders one item per store
 *  - ul has accessible aria-label
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

vi.mock('@/app/(app)/stores/actions', () => ({
  deleteStoreAction: vi.fn(),
  createStoreAction: vi.fn(),
  updateStoreAction: vi.fn(),
}));

import { StoreList } from '@/components/stores/StoreList';

const baseStore = {
  id: 'store-1',
  tenant_id: 't-1',
  nombre: 'Almacén Central',
  contacto: null,
  direccion: null,
  telefono: null,
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
  payment_terms_days: 30,
  // WU5 fiscal fields
  tipo_identificacion: '07',
  numero_identificacion: null,
  razon_social_comprobante: null,
};

describe('StoreList', () => {
  it('renders empty state when stores array is empty', () => {
    render(<StoreList stores={[]} />);
    expect(screen.getByText(/no hay tiendas/i)).toBeInTheDocument();
  });

  it('renders an accessible list when stores are present', () => {
    render(<StoreList stores={[baseStore]} />);
    expect(screen.getByRole('list', { name: /lista de tiendas/i })).toBeInTheDocument();
  });

  it('renders one list item per store', () => {
    const stores = [
      { ...baseStore, id: 'store-1', nombre: 'Almacén Central' },
      { ...baseStore, id: 'store-2', nombre: 'Depósito Norte' },
    ];
    render(<StoreList stores={stores} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Almacén Central')).toBeInTheDocument();
    expect(screen.getByText('Depósito Norte')).toBeInTheDocument();
  });
});
