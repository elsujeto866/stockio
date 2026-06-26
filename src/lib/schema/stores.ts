/**
 * Zod schemas for store mutations.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * Stores have no numeric fields — no z.coerce.number() is used.
 * All optional fields transform empty/null/undefined to null for DB storage.
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
});

export type StoreInput = z.infer<typeof StoreInputSchema>;
