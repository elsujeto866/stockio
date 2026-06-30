/**
 * SRI IVA backward-derivation helper — pure, no I/O, no side effects.
 *
 * Implements REQ-5: for a total that is already IVA-inclusive at 15%, derives
 * the taxable base and IVA amount using the same formula used by the
 * create_invoice RPC:
 *
 *   subtotal = round(total / 1.15, 2)
 *   iva      = total - subtotal
 *
 * The identity subtotal + iva === total holds exactly in numeric(14,2) arithmetic
 * because the subtraction is computed after rounding subtotal.
 */

/**
 * Derives the IVA base and IVA amount from an IVA-inclusive total (15% rate).
 *
 * @param total - IVA-inclusive total (must be > 0).
 * @returns Object with `subtotal` (base imponible) and `iva` amounts, both
 *          rounded to 2 decimal places.
 */
export function computeIvaInclusive(total: number): { subtotal: number; iva: number } {
  const subtotal = Math.round((total / 1.15) * 100) / 100;
  const iva = Math.round((total - subtotal) * 100) / 100;
  return { subtotal, iva };
}
