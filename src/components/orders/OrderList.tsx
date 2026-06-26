/**
 * OrderList — RSC presentational component.
 *
 * Maps an array of orders to OrderCard components.
 * Shows an empty-state prompt when no orders exist.
 */

import type { OrderListItem } from '@/lib/data/orders';
import { OrderCard } from './OrderCard';
import Link from 'next/link';

interface Props {
  orders: OrderListItem[];
}

export function OrderList({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-3">
        <p className="text-gray-500 text-sm">No orders yet.</p>
        <Link
          href="/orders/new"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors min-h-[44px]"
        >
          Create your first order
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Order list">
      {orders.map((order) => (
        <li key={order.id}>
          <OrderCard order={order} />
        </li>
      ))}
    </ul>
  );
}
