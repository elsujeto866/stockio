/**
 * Invoice detail (comprobante) page — RSC.
 *
 * AR-T24: Extended with AbonoForm and payment history (REQ-3/S3-1).
 *
 * Fetches the invoice by id (with nested order, store, and line items).
 * Fetches payment history via getPaymentsByInvoice.
 * Calls notFound() when getInvoice returns null — handles both missing
 * invoices and cross-tenant RLS blocks transparently.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getInvoice } from '@/lib/data/invoices';
import { getPaymentsByInvoice } from '@/lib/data/payments';
import { InvoiceDetail } from '@/components/invoices/InvoiceDetail';
import { AbonoForm } from '@/components/invoices/AbonoForm';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvoicePage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [invoice, payments] = await Promise.all([
    getInvoice(supabase, id),
    getPaymentsByInvoice(supabase, id),
  ]);

  if (!invoice) notFound();

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="text-sm text-brand hover:text-brand-dark font-medium transition-colors"
          >
            ← Facturas
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Factura #{invoice.numero}
          </h1>
        </div>

        <InvoiceDetail invoice={invoice} />

        {/* Abono form — allows recording partial or full payments */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <AbonoForm
            invoiceId={invoice.id}
            total={invoice.total}
            totalPaid={invoice.total_paid}
          />
        </div>

        {/* Payment history — server-rendered list */}
        {payments.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Historial de abonos</h2>
            <ul className="divide-y divide-gray-100">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-900">
                      {new Date(p.fecha + 'T00:00:00Z').toLocaleDateString('es-AR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    {p.notas && (
                      <span className="ml-2 text-gray-500 text-xs">{p.notas}</span>
                    )}
                  </div>
                  <span className="font-semibold text-gray-900">${p.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
