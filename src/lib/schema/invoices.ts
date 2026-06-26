/**
 * Zod schemas for invoice operations.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * CreateInvoiceSchema validates an invoice creation request:
 *   - orderId must be a valid UUID
 *
 * SetPaymentSchema validates a payment status update:
 *   - id must be a valid UUID
 *   - estado is optional and nullable; null clears the payment status
 */

import { z } from 'zod';

export const CreateInvoiceSchema = z.object({
  orderId: z.string().uuid('Order is required'),
});

export const SetPaymentSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum(['pendiente', 'pagado']).nullable().optional(),
});

export type CreateInvoicePayload = z.infer<typeof CreateInvoiceSchema>;
export type SetPaymentPayload = z.infer<typeof SetPaymentSchema>;
