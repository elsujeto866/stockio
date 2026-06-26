/**
 * PeriodTotalsWidget — RSC presentational component.
 *
 * Displays current-calendar-month sales summary:
 *  - Period label (e.g. "June 2026")
 *  - Total sales (sum of non-cancelado order totals, null guarded as 0)
 *  - Non-cancelado order count
 *  - Low-stock product count
 */

import type { OrderListItem } from '@/lib/data/orders';
import { sumOrderTotals, countNonCancelledOrders } from '@/lib/domain/dashboard';
import { formatCurrency } from '@/lib/format';

interface Props {
  orders: OrderListItem[];
  lowStockCount: number;
  period: { from: string; to: string; label: string };
}

export function PeriodTotalsWidget({ orders, lowStockCount, period }: Props) {
  const totalSales = sumOrderTotals(orders);
  const orderCount = countNonCancelledOrders(orders);

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Totales del mes</h2>
        <span className="text-sm text-gray-500">{period.label}</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Ventas</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(totalSales)}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pedidos</p>
          <p className="text-xl font-bold text-gray-900">{orderCount}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Stock bajo</p>
          <p className="text-xl font-bold text-gray-900">{lowStockCount}</p>
        </div>
      </div>
    </div>
  );
}
