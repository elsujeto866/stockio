/**
 * PeriodTotalsWidget — RSC presentational component.
 *
 * Displays current-calendar-month sales summary:
 *  - Period label (e.g. "June 2026")
 *  - Total sales (sum of non-cancelado order totals, null guarded as 0)
 *  - Non-cancelado order count
 *  - Low-stock product count
 *
 * Colored header: success green — celebrates the sales momentum.
 */

import type { OrderListItem } from '@/lib/data/orders';
import { sumOrderTotals, countNonCancelledOrders } from '@/lib/domain/dashboard';
import { formatCurrency } from '@/lib/format';
import { WidgetCard } from '@/components/dashboard/WidgetCard';

interface Props {
  orders: OrderListItem[];
  lowStockCount: number;
  period: { from: string; to: string; label: string };
}

export function PeriodTotalsWidget({ orders, lowStockCount, period }: Props) {
  const totalSales = sumOrderTotals(orders);
  const orderCount = countNonCancelledOrders(orders);

  return (
    <WidgetCard>
      {/* Success green header */}
      <div className="bg-success px-6 py-4 flex items-center justify-between">
        <h2 className="font-bold text-white">💰 Totales del mes</h2>
        <span className="text-sm text-white/80">{period.label}</span>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Ventas</p>
            <p className="text-2xl font-bold text-info">{formatCurrency(totalSales)}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Pedidos</p>
            <p className="text-2xl font-bold text-success">{orderCount}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Stock bajo</p>
            <p className="text-2xl font-bold text-danger">{lowStockCount}</p>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}
