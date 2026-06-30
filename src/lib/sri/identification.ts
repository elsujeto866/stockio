/**
 * SRI identification helpers — pure, no I/O, no side effects.
 *
 * Implements Ecuador cédula módulo-10 validation, RUC 13-digit check,
 * and consumidor-final edge case for Nivel 1 fiscal identification.
 *
 * REQ-3a: cédula (tipo '05') — 10 digits, province 01-24 or 30, third digit < 6,
 *         passes módulo-10 algorithm.
 * REQ-3b: RUC (tipo '04') — 13 numeric digits (lenient at Nivel 1).
 */

const COEF = [2, 1, 2, 1, 2, 1, 2, 1, 2] as const;

/**
 * Computes the expected módulo-10 verifier digit from the first 9 digits of an
 * Ecuador cédula.
 *
 * Algorithm:
 *   1. Multiply each digit by its coefficient [2,1,2,1,2,1,2,1,2].
 *   2. Subtract 9 from any product >= 10.
 *   3. Sum the 9 results.
 *   4. verifier = (10 - (sum % 10)) % 10
 *
 * @param first9 - Exactly the first 9 digit characters of a cédula string.
 * @returns Expected verifier digit (0–9).
 */
export function module10(first9: string): number {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let p = parseInt(first9[i], 10) * COEF[i];
    if (p >= 10) p -= 9;
    sum += p;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Validates an Ecuador cédula (persona natural, tipo '05').
 *
 * Rules:
 *   - Exactly 10 numeric digits.
 *   - Province code (first 2 digits as integer) in range 1–24 or 30.
 *   - Third digit (index 2) must be < 6 (natural-person discriminator).
 *   - Passes módulo-10 checksum.
 *
 * @param v - Raw string to validate.
 * @returns true if valid, false otherwise.
 */
export function isValidCedula(v: string): boolean {
  if (!/^\d{10}$/.test(v)) return false;

  const province = parseInt(v.slice(0, 2), 10);
  if (!((province >= 1 && province <= 24) || province === 30)) return false;

  const thirdDigit = parseInt(v[2], 10);
  if (thirdDigit >= 6) return false;

  const verifier = module10(v.slice(0, 9));
  return verifier === parseInt(v[9], 10);
}

/**
 * Validates an Ecuador RUC (tipo '04').
 *
 * Nivel 1 lenient rule: exactly 13 numeric digits.
 * Deeper RUC algorithmic check (company/public-entity sub-rules) is deferred
 * to Nivel 2+.
 *
 * @param v - Raw string to validate.
 * @returns true if valid, false otherwise.
 */
export function isValidRuc(v: string): boolean {
  return /^\d{13}$/.test(v);
}
