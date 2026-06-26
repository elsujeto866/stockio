/**
 * Invoices list page — RSC.
 *
 * Fetches all invoices for the authenticated tenant (ordered by numero DESC)
 * and renders them via InvoiceList.
 * RLS scopes results to the caller's tenant automatically.
 */

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getInvoices } from '@/lib/data/invoices';
import { InvoiceList } from '@/components/invoices/InvoiceList';

export default async function InvoicesPage() {
  await requireUser();
  const supabase = await createClient();
  const invoices = await getInvoices(supabase);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
        </div>

        <InvoiceList invoices={invoices} />
      </div>
    </main>
  );
}
