/**
 * Zod schemas for tenant mutations.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * TenantEmisorSchema (REQ-4, ADR D6):
 *   ruc: exactly 13 numeric digits — required for invoice emission
 *   estab: establishment code, defaults to '001'
 *   pto_emi: emission point code, defaults to '001'
 */

import { z } from 'zod';

export const TenantEmisorSchema = z.object({
  ruc: z
    .string()
    .regex(/^\d{13}$/, 'El RUC debe tener exactamente 13 dígitos numéricos'),
  estab: z.string().default('001'),
  pto_emi: z.string().default('001'),
});

export type TenantEmisorInput = z.infer<typeof TenantEmisorSchema>;
