/**
 * Zod schemas for purchase creation.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * PurchaseItemInputSchema validates a single line item:
 *   - productId must be a valid UUID
 *   - cantidad uses z.coerce so FormData string values are handled transparently;
 *     must be integer >= 1
 *   - costoUnitario uses z.coerce; must be >= 0 (zero-cost lines are valid)
 *
 * CreatePurchaseSchema validates the full create-purchase payload:
 *   - supplierId must be a valid UUID (required)
 *   - items must contain at least one item
 *   - fecha is optional; empty string transforms to undefined
 *   - notas is optional; empty/null transforms to null
 *
 * Items reach the Server Action as a JSON string (hidden FormData field) and are
 * parsed by the action before passing to this schema.
 */

import { z } from 'zod';

export const PurchaseItemInputSchema = z.object({
  productId: z.string().uuid('Product ID must be a valid UUID'),
  cantidad: z.coerce.number().int().min(1, 'La cantidad debe ser al menos 1'),
  costoUnitario: z.coerce.number().min(0, 'El costo debe ser >= 0'),
  /** Per-line expiry date override. Empty string → null (no override). */
  expiryDate: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
});

export const CreatePurchaseSchema = z.object({
  supplierId: z.string().uuid('Selecciona un proveedor'),
  fecha: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  items: z.array(PurchaseItemInputSchema).min(1, 'Agrega al menos un producto'),
  notas: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export type PurchaseItemInput = z.infer<typeof PurchaseItemInputSchema>;
export type CreatePurchasePayload = z.infer<typeof CreatePurchaseSchema>;
