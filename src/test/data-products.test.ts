import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { getProducts, getProduct } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const activeProduct = {
  id: 'prod-1',
  tenant_id: 'tenant-1',
  nombre: 'Aceite de Oliva',
  sku: 'OL-001',
  categoria: 'Alimentos',
  precio_unitario: 12.5,
  stock_actual: 100,
  stock_minimo: 10,
  unidad_medida: 'litro',
  activo: true,
  created_at: '2026-01-01T00:00:00Z',
};

const inactiveProduct = {
  ...activeProduct,
  id: 'prod-2',
  nombre: 'Discontinued Item',
  activo: false,
};

// ---------------------------------------------------------------------------
// getProducts
// ---------------------------------------------------------------------------
describe('getProducts', () => {
  it('returns only active products', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [activeProduct, inactiveProduct] },
    });

    const products = await getProducts(supabase);

    // The data fn adds .eq('activo', true); the mock builder filters on that
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe('prod-1');
    expect(products[0].nombre).toBe('Aceite de Oliva');
  });

  it('returns an empty array when there are no active products', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [inactiveProduct] },
    });

    const products = await getProducts(supabase);

    expect(products).toHaveLength(0);
  });

  it('returns an empty array when the table is empty', async () => {
    const supabase = createMockSupabaseClient({ tables: { products: [] } });
    const products = await getProducts(supabase);
    expect(products).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getProduct
// ---------------------------------------------------------------------------
describe('getProduct', () => {
  it('returns the matching product when the id exists', async () => {
    const supabase = createMockSupabaseClient({
      tables: { products: [activeProduct] },
    });

    const product = await getProduct(supabase, 'prod-1');

    expect(product).not.toBeNull();
    expect(product?.id).toBe('prod-1');
    expect(product?.nombre).toBe('Aceite de Oliva');
    expect(product?.precio_unitario).toBe(12.5);
  });

  it('returns null when the product id is not found', async () => {
    const supabase = createMockSupabaseClient({ tables: { products: [] } });

    const product = await getProduct(supabase, 'nonexistent-id');

    expect(product).toBeNull();
  });
});
