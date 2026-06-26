/**
 * Order detail page — RSC.
 *
 * Fetches the order and its invoice in parallel:
 *  - getOrder — full nested detail (store + line items)
 *  - getInvoiceByOrderId — lightweight check to get the invoice id (if any)
 *
 * Calls notFound() when getOrder returns null — handles both missing orders
 * and cross-tenant RLS blocks transparently.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getOrder } from '@/lib/data/orders';
import { getInvoiceByOrderId } from '@/lib/data/invoices';
import { OrderDetail } from '@/components/orders/OrderDetail';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const [order, invoice] = await Promise.all([
    getOrder(supabase, id),
    getInvoiceByOrderId(supabase, id),
  ]);

  if (!order) notFound();

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="text-sm text-brand hover:text-brand-dark font-medium transition-colors"
          >
            ← Pedidos
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Detalle del pedido</h1>
        </div>

        <OrderDetail order={order} invoiceId={invoice?.id ?? null} />
      </div>
    </main>
  );
}
