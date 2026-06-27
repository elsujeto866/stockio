/**
 * Zod schemas for product mutations.
 *
 * Pure — no I/O, no side effects.
 * Safe to import in Server Actions and unit tests without a DB connection.
 *
 * z.coerce.number() handles FormData string values by coercing them to numbers
 * before validation runs.
 */

import { z } from 'zod';

/**
 * Converts empty string and undefined to null before coercion.
 *
 * z.coerce.number() turns '' into 0, so a blank pack field would silently
 * become 0 and then fail min(2). Mapping '' → null first lets the field be
 * truly optional while keeping the nullable() coercion path clean.
 */
const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

export const ProductInputSchema = z
  .object({
    nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
    sku: z
      .string()
      .max(100)
      .nullable()
      .optional()
      .transform((v) => v || null),
    categoria: z
      .string()
      .max(100)
      .nullable()
      .optional()
      .transform((v) => v || null),
    precio_unitario: z.coerce.number().min(0, 'El precio debe ser mayor o igual a 0'),
    stock_actual: z.coerce.number().int().min(0, 'El stock actual debe ser mayor o igual a 0'),
    stock_minimo: z.coerce.number().int().min(0, 'El stock mínimo debe ser mayor o igual a 0'),
    unidad_medida: z
      .string()
      .max(50)
      .nullable()
      .optional()
      .transform((v) => v || null),
    units_per_package: z.preprocess(
      emptyToNull,
      z.coerce
        .number()
        .int()
        .min(2, 'Las unidades por paca deben ser al menos 2')
        .nullable()
    ),
    precio_paca: z.preprocess(
      emptyToNull,
      z.coerce.number().min(0, 'El precio de paca debe ser mayor o igual a 0').nullable()
    ),
  })
  .refine(
    (d) => d.precio_paca === null || d.units_per_package !== null,
    {
      message: 'Define las unidades por paca para asignar un precio de paca',
      path: ['precio_paca'],
    }
  );

export type ProductInput = z.infer<typeof ProductInputSchema>;

/**
 * Schema for manual stock adjustments.
 * delta is a signed integer — positive increases, negative decreases stock.
 * The DB CHECK constraint enforces that stock_actual never goes below 0.
 */
export const StockAdjustSchema = z.object({
  delta: z.coerce.number().int(),
});

export type StockAdjust = z.infer<typeof StockAdjustSchema>;
