/**
 * Formatting helpers.
 *
 * formatCurrency — formats a number as USD currency in US locale (en-US).
 * formatDate     — formats an ISO date string (YYYY-MM-DD) in Ecuador locale (es-EC).
 *
 * Both use Intl APIs so no external library is needed.
 */

/**
 * Formats a number as a USD currency string using the en-US locale.
 * Example: formatCurrency(99.5) → "$99.50"
 */
export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n);
}

/**
 * Formats an ISO date string (YYYY-MM-DD) using the es-EC locale with medium style.
 * Parses as a local date to avoid UTC-midnight timezone shifts.
 * Example: formatDate('2026-06-15') → "15 jun. 2026"
 */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(
    new Date(y, m - 1, d)
  );
}
