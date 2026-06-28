/**
 * AR-T8 — Zod schema for recording a payment.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * RecordPaymentSchema validates the record-payment form/action payload:
 *   - invoiceId must be a valid UUID
 *   - amount coerced from FormData string; must be positive (> 0)
 *   - fecha: optional date; empty string → null (RPC uses current_date as default)
 *   - notas: optional note; empty/null → null; max 500 chars
 *
 * Covers: REQ-2/S2-5
 */

import { z } from 'zod';

export const RecordPaymentSchema = z.object({
  invoiceId: z.string().uuid('Invoice ID must be a valid UUID'),

  amount: z.coerce
    .number()
    .positive('El abono debe ser mayor a 0'),

  fecha: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === '' || v == null ? null : v))
    .pipe(z.string().date().nullable()),

  notas: z
    .string()
    .max(500, 'Las notas no pueden superar los 500 caracteres')
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export type RecordPaymentPayload = z.infer<typeof RecordPaymentSchema>;
