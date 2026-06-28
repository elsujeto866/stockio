/**
 * Returns today's date as an ISO-8601 date string (YYYY-MM-DD, UTC).
 *
 * Exported as a function so tests can mock it with vi.mock.
 */
export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}
