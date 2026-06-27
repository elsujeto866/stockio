/**
 * Zod schemas for supplier mutations.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * Key invariant: empty-string email must NOT trigger .email() validation.
 * Strategy: z.preprocess converts '' to undefined BEFORE .email() validates.
 * This allows FormData to send an empty email field without triggering an error.
 */

import { z } from 'zod';

export const SupplierInputSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido'),
  ruc: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
  contacto: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
  telefono: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
  // Preprocess converts '' → undefined so the .email() check is skipped for empty submissions.
  // nullable() allows null input (e.g. from DB reads).
  // transform(v => v ?? null) converts undefined output to null for DB storage.
  email: z
    .preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().email('Email inválido').optional()
    )
    .nullable()
    .transform((v) => v ?? null),
  notas: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export type SupplierInput = z.infer<typeof SupplierInputSchema>;
