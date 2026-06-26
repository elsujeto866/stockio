/**
 * Zod schemas for order creation.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * OrderItemInputSchema validates a single line item:
 *   - productId must be a valid UUID
 *   - cantidad uses z.coerce so FormData string values are handled transparently;
 *     must be an integer ≥ 1
 *
 * CreateOrderSchema validates the full create-order payload:
 *   - storeId must be a valid UUID (required)
 *   - items array must contain at least one item
 *   - notas is optional; empty string and null are both transformed to null
 *
 * Items reach the Server Action as a JSON string (hidden FormData field) and are
 * parsed by the action before passing to this schema — coerce handles both the
 * JSON-parsed number and any remaining string edge-cases safely.
 */

import { z } from 'zod';

export const OrderItemInputSchema = z.object({
  productId: z.string().uuid('Product ID must be a valid UUID'),
  cantidad: z.coerce.number().int().min(1, 'La cantidad debe ser al menos 1'),
});

export const CreateOrderSchema = z.object({
  storeId: z.string().uuid('Selecciona una tienda'),
  items: z.array(OrderItemInputSchema).min(1, 'Agrega al menos un producto'),
  notas: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export type OrderItemInput = z.infer<typeof OrderItemInputSchema>;
export type CreateOrderPayload = z.infer<typeof CreateOrderSchema>;
