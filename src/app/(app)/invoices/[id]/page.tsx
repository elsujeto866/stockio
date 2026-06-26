/**
 * Invoice detail (comprobante) page — RSC.
 *
 * Fetches the invoice by id (with nested order, store, and line items).
 * Calls notFound() when getInvoice returns null — handles both missing
 * invoices and cross-tenant RLS blocks transparently.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getInvoice } from '@/lib/data/invoices';
import { InvoiceDetail } from '@/components/invoices/InvoiceDetail';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvoicePage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const invoice = await getInvoice(supabase, id);

  if (!invoice) notFound();

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Facturas
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">
            Factura #{invoice.numero}
          </h1>
        </div>

        <InvoiceDetail invoice={invoice} />
      </div>
    </main>
  );
}
