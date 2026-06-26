import { describe, it, expect } from 'vitest';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import {
  getInvoices,
  getInvoice,
  getInvoiceByOrderId,
  createInvoice,
  setInvoicePaymentStatus,
} from '@/lib/data/invoices';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const sampleInvoice = {
  id: 'invoice-1',
  tenant_id: 'tenant-1',
  order_id: 'order-1',
  numero: 1,
  fecha_emision: '2026-06-26',
  total: 150.00,
  estado_pago: null,
  created_at: '2026-06-26T00:00:00Z',
};

const INVOICE_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
const ORDER_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00002222';

// ---------------------------------------------------------------------------
// getInvoices
// ---------------------------------------------------------------------------
describe('getInvoices', () => {
  it('returns InvoiceListItem array with order.store.nombre from mock table', async () => {
    const fixture = {
      ...sampleInvoice,
      order: { store: { nombre: 'Main Store' } },
    };
    const supabase = createMockSupabaseClient({ tables: { invoices: [fixture] } });

    const result = await getInvoices(supabase);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('invoice-1');
    expect(result[0].order?.store?.nombre).toBe('Main Store');
  });

  it('returns an empty array when there are no invoices', async () => {
    const supabase = createMockSupabaseClient({ tables: { invoices: [] } });
    const result = await getInvoices(supabase);
    expect(result).toHaveLength(0);
  });

  it('returns an empty array on success with no data', async () => {
    // mutationError only applies to mutations — use a table fixture with no rows
    // to verify the error-free path returns empty array.
    const supabaseOk = createMockSupabaseClient({ tables: { invoices: [] } });
    await expect(getInvoices(supabaseOk)).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getInvoice
// ---------------------------------------------------------------------------
describe('getInvoice', () => {
  it('returns InvoiceDetail with nested order data when found', async () => {
    const detailFixture = {
      ...sampleInvoice,
      order: {
        id: 'order-1',
        fecha: '2026-06-25',
        total: 150.00,
        notas: null,
        store: { nombre: 'Main Store' },
        items: [
          {
            id: 'item-1',
            product_id: 'prod-1',
            cantidad: 3,
            precio_unitario: 50.00,
            subtotal: 150.00,
            product: { nombre: 'Widget' },
          },
        ],
      },
    };
    const supabase = createMockSupabaseClient({
      tables: { invoices: [detailFixture] },
    });

    const result = await getInvoice(supabase, 'invoice-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('invoice-1');
    expect(result?.numero).toBe(1);
    expect(result?.order?.store?.nombre).toBe('Main Store');
    expect(result?.order?.items).toHaveLength(1);
    expect(result?.order?.items[0].product?.nombre).toBe('Widget');
    expect(result?.order?.items[0].subtotal).toBe(150.00);
  });

  it('returns null when the invoice is not found', async () => {
    const supabase = createMockSupabaseClient({ tables: { invoices: [] } });

    const result = await getInvoice(supabase, 'non-existent-id');

    expect(result).toBeNull();
  });

  it('filters by id — returns null for a non-matching id', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: [{ ...sampleInvoice, id: 'invoice-X' }] },
    });

    // eq('id', 'different-id') will filter out the row → data: null → returns null
    const result = await getInvoice(supabase, 'different-id');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getInvoiceByOrderId
// ---------------------------------------------------------------------------
describe('getInvoiceByOrderId', () => {
  it('returns the invoice when found for the given orderId', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: [sampleInvoice] },
    });

    const result = await getInvoiceByOrderId(supabase, 'order-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('invoice-1');
    expect(result?.order_id).toBe('order-1');
    expect(result?.numero).toBe(1);
  });

  it('returns null when no invoice exists for the orderId', async () => {
    const supabase = createMockSupabaseClient({ tables: { invoices: [] } });

    const result = await getInvoiceByOrderId(supabase, 'order-no-invoice');

    expect(result).toBeNull();
  });

  it('filters by order_id — returns null when order_id does not match', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: [{ ...sampleInvoice, order_id: 'order-other' }] },
    });

    const result = await getInvoiceByOrderId(supabase, 'order-1');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createInvoice
// ---------------------------------------------------------------------------
describe('createInvoice', () => {
  it('calls create_invoice RPC with the correct p_order_id and returns the invoice id', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const supabase = createMockSupabaseClient({
      rpcs: {
        create_invoice: (args) => {
          capturedArgs = args;
          return { data: INVOICE_UUID, error: null };
        },
      },
    });

    const result = await createInvoice(supabase, ORDER_UUID);

    expect(capturedArgs).toEqual({ p_order_id: ORDER_UUID });
    expect(result).toBe(INVOICE_UUID);
  });

  it('throws when the RPC returns an error', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        create_invoice: () => ({
          data: null,
          error: { message: 'Cancelled orders cannot be invoiced', code: 'P0001' },
        }),
      },
    });

    await expect(createInvoice(supabase, ORDER_UUID)).rejects.toMatchObject({
      message: 'Cancelled orders cannot be invoiced',
    });
  });

  it('throws when the RPC reports invoice already exists', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        create_invoice: () => ({
          data: null,
          error: {
            message: `Invoice already exists for order ${ORDER_UUID}`,
            code: 'P0001',
          },
        }),
      },
    });

    await expect(createInvoice(supabase, ORDER_UUID)).rejects.toMatchObject({
      message: expect.stringContaining('Invoice already exists for order'),
    });
  });

  it('throws when the RPC reports order not found', async () => {
    const supabase = createMockSupabaseClient({
      rpcs: {
        create_invoice: () => ({
          data: null,
          error: {
            message: `Order ${ORDER_UUID} not found in tenant`,
            code: 'P0001',
          },
        }),
      },
    });

    await expect(createInvoice(supabase, ORDER_UUID)).rejects.toMatchObject({
      message: expect.stringContaining('not found in tenant'),
    });
  });
});

// ---------------------------------------------------------------------------
// setInvoicePaymentStatus
// ---------------------------------------------------------------------------
describe('setInvoicePaymentStatus', () => {
  it('calls update with estado_pago: "pagado" on the correct invoice id', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: [sampleInvoice] },
    });

    await setInvoicePaymentStatus(supabase, 'invoice-1', 'pagado');

    expect(supabase.__captured.updatePayload).toEqual({ estado_pago: 'pagado' });
  });

  it('calls update with estado_pago: "pendiente"', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: [sampleInvoice] },
    });

    await setInvoicePaymentStatus(supabase, 'invoice-1', 'pendiente');

    expect(supabase.__captured.updatePayload).toEqual({ estado_pago: 'pendiente' });
  });

  it('calls update with estado_pago: null to clear status', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: [sampleInvoice] },
    });

    await setInvoicePaymentStatus(supabase, 'invoice-1', null);

    expect(supabase.__captured.updatePayload).toEqual({ estado_pago: null });
  });

  it('resolves without throwing on success', async () => {
    const supabase = createMockSupabaseClient({
      tables: { invoices: [sampleInvoice] },
    });

    await expect(
      setInvoicePaymentStatus(supabase, 'invoice-1', 'pagado')
    ).resolves.toBeUndefined();
  });

  it('throws when the update returns an error', async () => {
    const supabase = createMockSupabaseClient({
      mutationError: { message: 'RLS policy violation', code: '42501' },
    });

    await expect(
      setInvoicePaymentStatus(supabase, 'invoice-1', 'pagado')
    ).rejects.toMatchObject({ message: 'RLS policy violation' });
  });
});
