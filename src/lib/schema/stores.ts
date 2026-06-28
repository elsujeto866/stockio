/**
 * Zod schemas for store mutations.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * All optional string fields transform empty/null/undefined to null for DB storage.
 * payment_terms_days uses z.coerce so FormData strings are coerced to integers.
 */

import { z } from 'zod';

export const StoreInputSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  contacto: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
  direccion: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
  telefono: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
  payment_terms_days: z.coerce.number().int().min(0).default(30),
});

export type StoreInput = z.infer<typeof StoreInputSchema>;
