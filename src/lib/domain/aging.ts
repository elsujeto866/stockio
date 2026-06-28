/**
 * Aging domain helpers.
 *
 * Pure functions — no I/O, no side effects.
 * Importable in both RSC and client components without bundling Supabase.
 *
 * Covers: REQ-5 — aging bucket classification; REQ-3 — outstanding balance.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

// ---------------------------------------------------------------------------
// agingBucket
// ---------------------------------------------------------------------------

/**
 * Classifies an invoice's aging bucket based on days-past-due.
 *
 * dpd = today - dueDate (in whole days, UTC).
 *
 * | Condition       | Bucket   |
 * |-----------------|----------|
 * | dpd <= 0        | current  |
 * | 1 <= dpd <= 30  | 1-30     |
 * | 31 <= dpd <= 60 | 31-60    |
 * | 61 <= dpd <= 90 | 61-90    |
 * | dpd > 90        | 90+      |
 *
 * NULL dueDate (invoices created before migration) → returns 'current'.
 * UTC date math avoids timezone-induced off-by-one errors.
 *
 * @param dueDate  ISO date string ('YYYY-MM-DD') or null
 * @param today    ISO date string injected by caller (never new Date() inline)
 */
export function agingBucket(dueDate: string | null, today: string): AgingBucket {
  if (dueDate === null) return 'current';

  const dpd = diffDays(dueDate, today);

  if (dpd <= 0) return 'current';
  if (dpd <= 30) return '1-30';
  if (dpd <= 60) return '31-60';
  if (dpd <= 90) return '61-90';
  return '90+';
}

// ---------------------------------------------------------------------------
// outstanding
// ---------------------------------------------------------------------------

/**
 * Computes the outstanding balance for an invoice.
 *
 * outstanding = round2(total - totalPaid), floored at 0.
 * The floor prevents negative results from numeric drift.
 *
 * @param total      Invoice total (numeric)
 * @param totalPaid  Amount already paid (numeric)
 */
export function outstanding(total: number, totalPaid: number): number {
  return Math.max(0, round2(total - totalPaid));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns today - dueDate in whole days (positive means overdue).
 * All arithmetic uses Date.UTC to avoid timezone issues.
 */
function diffDays(dueDate: string, today: string): number {
  const [dy, dm, dd] = dueDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);

  const dueMs = Date.UTC(dy, dm - 1, dd);
  const todayMs = Date.UTC(ty, tm - 1, td);

  return Math.round((todayMs - dueMs) / 86_400_000);
}

/**
 * Rounds a number to 2 decimal places using the same pattern as Math.round(n*100)/100.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
