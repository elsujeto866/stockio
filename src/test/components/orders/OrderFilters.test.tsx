/**
 * Unit tests for OrderFilters (WU-B1).
 *
 * Verifies:
 *  - Store select is rendered with correct options
 *  - From + To date inputs are rendered
 *  - Changing the store select calls router.push with the store param
 *  - Changing a date input calls router.push with the param
 *  - Clearing a select removes the param from the URL
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

import { useSearchParams } from 'next/navigation';
import { OrderFilters } from '@/components/orders/OrderFilters';
import type { Store } from '@/lib/data/stores';

const stores: Store[] = [
  {
    id: 'store-1',
    tenant_id: 't-1',
    nombre: 'Almacén Central',
    contacto: null,
    direccion: null,
    telefono: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'store-2',
    tenant_id: 't-1',
    nombre: 'Sucursal Norte',
    contacto: null,
    direccion: null,
    telefono: null,
    activo: true,
    created_at: '2026-01-02T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
});

describe('OrderFilters', () => {
  it('renders a store select with "All stores" default option', () => {
    render(<OrderFilters stores={stores} />);
    const select = screen.getByRole('combobox', { name: /store/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /all stores/i })).toBeInTheDocument();
  });

  it('renders store options from the stores prop', () => {
    render(<OrderFilters stores={stores} />);
    expect(screen.getByRole('option', { name: /Almacén Central/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Sucursal Norte/i })).toBeInTheDocument();
  });

  it('renders From date input', () => {
    render(<OrderFilters stores={stores} />);
    expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
  });

  it('renders To date input', () => {
    render(<OrderFilters stores={stores} />);
    expect(screen.getByLabelText(/^to$/i)).toBeInTheDocument();
  });

  it('calls router.push with store param when store select changes', () => {
    render(<OrderFilters stores={stores} />);
    const select = screen.getByRole('combobox', { name: /store/i });

    fireEvent.change(select, { target: { value: 'store-1' } });

    expect(mockPush).toHaveBeenCalledOnce();
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toContain('store=store-1');
  });

  it('calls router.push with from param when from date changes', () => {
    render(<OrderFilters stores={stores} />);
    const fromInput = screen.getByLabelText(/from/i);

    fireEvent.change(fromInput, { target: { value: '2026-06-01' } });

    expect(mockPush).toHaveBeenCalledOnce();
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toContain('from=2026-06-01');
  });

  it('calls router.push with to param when to date changes', () => {
    render(<OrderFilters stores={stores} />);
    const toInput = screen.getByLabelText(/^to$/i);

    fireEvent.change(toInput, { target: { value: '2026-06-30' } });

    expect(mockPush).toHaveBeenCalledOnce();
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toContain('to=2026-06-30');
  });

  it('removes the store param when "All stores" (empty value) is selected', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('store=store-1') as never
    );

    render(<OrderFilters stores={stores} />);
    const select = screen.getByRole('combobox', { name: /store/i });

    fireEvent.change(select, { target: { value: '' } });

    expect(mockPush).toHaveBeenCalledOnce();
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).not.toContain('store=');
  });
});
