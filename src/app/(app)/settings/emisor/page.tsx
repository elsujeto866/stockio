/**
 * /settings/emisor page — RSC.
 *
 * Loads the current tenant's emisor config and renders EmisorForm.
 * Protected by requireUser() (belt-and-suspenders with layout guard).
 *
 * The RUC field is critical: a NULL RUC blocks invoice emission (REQ-4a).
 * This page is the self-service path for tenant operators to configure it.
 */

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getTenantEmisor } from '@/lib/data/tenants';
import { EmisorForm } from '@/components/settings/EmisorForm';
import { updateEmisorAction } from '@/app/(app)/settings/emisor/actions';

export default async function EmisorPage() {
  await requireUser();
  const supabase = await createClient();
  const emisor = await getTenantEmisor(supabase);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Configuración del emisor</h1>
          <p className="text-sm text-gray-500">
            Configure el RUC y los datos de establecimiento de su empresa. El RUC es obligatorio
            para emitir facturas.
          </p>
        </div>

        {!emisor.ruc && (
          <div
            role="alert"
            className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800"
          >
            <strong>RUC no configurado.</strong> No podrá emitir facturas hasta ingresar un RUC
            válido de 13 dígitos.
          </div>
        )}

        <EmisorForm action={updateEmisorAction} initialData={emisor} />
      </div>
    </main>
  );
}
