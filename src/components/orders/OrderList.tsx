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
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center space-y-3">
        <p className="text-3xl">🚚</p>
        <p className="text-gray-500 text-sm">No hay pedidos todavía</p>
        <Link
          href="/orders/new"
          className="btn-primary"
        >
          Crea tu primer pedido
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Lista de pedidos">
      {orders.map((order) => (
        <li key={order.id}>
          <OrderCard order={order} />
        </li>
      ))}
    </ul>
  );
}
