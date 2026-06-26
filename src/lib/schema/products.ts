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

export const ProductInputSchema = z.object({
  nombre: z.string().min(1, 'Name is required').max(255),
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
  precio_unitario: z.coerce.number().min(0, 'Price must be non-negative'),
  stock_actual: z.coerce.number().int().min(0, 'Current stock must be non-negative'),
  stock_minimo: z.coerce.number().int().min(0, 'Minimum stock must be non-negative'),
  unidad_medida: z
    .string()
    .max(50)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

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
