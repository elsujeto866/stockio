/**
 * Zod schemas for store mutations.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * All optional string fields transform empty/null/undefined to null for DB storage.
 * payment_terms_days uses z.coerce so FormData strings are coerced to integers.
 *
 * Fiscal identifier fields (REQ-3a–3e):
 *   tipo_identificacion: enum '04'|'05'|'06'|'07'|'08', default '07' (Consumidor Final)
 *   numero_identificacion: validated per tipo; tipo '07' auto-fills '9999999999999'
 *   razon_social_comprobante: nullable; tipo '07' auto-fills 'CONSUMIDOR FINAL'
 */

import { z } from 'zod';
import { isValidCedula, isValidRuc } from '@/lib/sri/identification';

export const StoreInputSchema = z
  .object({
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

    // Fiscal identifier fields
    tipo_identificacion: z.enum(['04', '05', '06', '07', '08']).default('07'),
    numero_identificacion: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null),
    razon_social_comprobante: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null),
  })
  .superRefine((data, ctx) => {
    const tipo = data.tipo_identificacion;
    const numero = data.numero_identificacion;

    if (tipo === '05') {
      // Cédula: 10 digits, passes módulo-10
      if (!numero || !isValidCedula(numero)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Número de cédula inválido (módulo-10)',
          path: ['numero_identificacion'],
        });
      }
    } else if (tipo === '04') {
      // RUC: exactly 13 numeric digits (Nivel 1 lenient)
      if (!numero || !isValidRuc(numero)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El RUC debe tener exactamente 13 dígitos numéricos',
          path: ['numero_identificacion'],
        });
      }
    } else if (tipo === '06' || tipo === '08') {
      // Pasaporte / Exterior: any non-empty string
      if (!numero) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El número de identificación es obligatorio',
          path: ['numero_identificacion'],
        });
      }
    }
    // tipo '07' (Consumidor Final): no validation needed — transform fills defaults
  })
  .transform((data) => {
    if (data.tipo_identificacion === '07') {
      return {
        ...data,
        numero_identificacion: '9999999999999',
        razon_social_comprobante: 'CONSUMIDOR FINAL',
      };
    }
    return data;
  });

export type StoreInput = z.infer<typeof StoreInputSchema>;
