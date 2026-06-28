/**
 * Product detail page — RSC.
 *
 * Shows product info and inventory lots (LotList).
 * Links to edit and stock-adjust pages.
 *
 * REQ-6: display lot-level expiry status badges.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';
import { getProduct } from '@/lib/data/products';
import { getLotsByProduct } from '@/lib/data/lots';
import { sortByFEFO } from '@/lib/domain/expiry';
import { LotList } from '@/components/products/LotList';
import { getToday } from '@/lib/utils/today';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const [product, allLots] = await Promise.all([
    getProduct(supabase, id),
    getLotsByProduct(supabase, id),
  ]);

  if (!product) notFound();

  const today = getToday();
  // sortByFEFO applies FEFO ordering on the client (DB already returns in FEFO order,
  // but sort is applied for display consistency with the domain layer).
  const lots = sortByFEFO(allLots);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="text-sm text-brand hover:text-brand-dark font-medium"
          >
            ← Productos
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{product.nombre}</h1>
        </div>

        {/* ── Product summary ────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-brand" />
          <div className="p-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <DetailRow label="SKU" value={product.sku ?? '—'} />
            <DetailRow label="Categoría" value={product.categoria ?? '—'} />
            <DetailRow label="Precio unitario" value={`$${product.precio_unitario.toFixed(2)}`} />
            <DetailRow label="Stock actual" value={String(product.stock_actual)} />
            <DetailRow label="Stock mínimo" value={String(product.stock_minimo)} />
            {product.shelf_life_days !== null && (
              <DetailRow label="Vida útil" value={`${product.shelf_life_days} días`} />
            )}
            <DetailRow label="Alerta vencimiento" value={`${product.expiry_alert_days} días`} />
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────── */}
        <div className="flex gap-3">
          <Link
            href={`/products/${id}/edit`}
            className="btn-secondary text-sm"
          >
            Editar
          </Link>
          <Link
            href={`/products/${id}/adjust`}
            className="btn-secondary text-sm"
          >
            Ajustar stock
          </Link>
        </div>

        {/* ── Lot list (REQ-6) ──────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="h-1 bg-info" />
          <div className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-info uppercase tracking-wide">
              Lotes de inventario
            </h2>
            <LotList
              lots={lots}
              today={today}
              alertDays={product.expiry_alert_days}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-900">{value}</dd>
    </div>
  );
}
