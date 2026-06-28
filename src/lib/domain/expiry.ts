/**
 * Expiry domain helpers.
 *
 * Pure functions — no I/O, no side effects.
 * Importable in both RSC and client components without bundling Supabase.
 *
 * Covers: REQ-1, REQ-6
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExpiryStatus = 'none' | 'ok' | 'expiring_soon' | 'expired';

/** Minimal lot shape required by sortByFEFO. */
export interface FEFOLot {
  id: string;
  expiry_date: string | null;
  received_date: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// computeExpiryDate
// ---------------------------------------------------------------------------

/**
 * Computes the expiry date by adding shelf_life_days to the received date.
 *
 * Priority rule (mirrors the RPC logic):
 *   - shelfLifeDays IS NULL → return null (no computable expiry)
 *   - receivedDate IS NULL  → fall back to today (UTC)
 *   - Otherwise: receivedDate + shelfLifeDays
 *
 * All arithmetic is done in UTC to avoid timezone-induced off-by-one errors.
 * Returns an ISO date string ("YYYY-MM-DD") or null.
 */
export function computeExpiryDate(
  receivedDate: string | null,
  shelfLifeDays: number | null
): string | null {
  if (shelfLifeDays === null) return null;

  const base = receivedDate ?? utcToday();
  const [year, month, day] = base.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + shelfLifeDays));

  return dateToIso(d);
}

// ---------------------------------------------------------------------------
// isExpired
// ---------------------------------------------------------------------------

/**
 * Returns true when the lot is past its expiry date.
 *
 * Spec: `expiry_date < current_date` AND quantity > 0
 * (quantity guard is handled at the call site — this function is pure date logic)
 *
 * NULL expiry is NEVER expired (S6-3).
 */
export function isExpired(expiryDate: string | null, today: string): boolean {
  if (expiryDate === null) return false;
  return expiryDate < today;
}

// ---------------------------------------------------------------------------
// isExpiringSoon
// ---------------------------------------------------------------------------

/**
 * Returns true when the lot expires within [today, today + alertDays] (inclusive).
 *
 * Spec: `expiry_date >= current_date AND expiry_date <= current_date + product.expiry_alert_days`
 *
 * NULL expiry NEVER triggers an alert (S6-3).
 * Already-expired lots return false (past today does not qualify as "soon").
 */
export function isExpiringSoon(
  expiryDate: string | null,
  alertDays: number,
  today: string
): boolean {
  if (expiryDate === null) return false;
  if (expiryDate < today) return false; // already expired

  const threshold = addDays(today, alertDays);
  return expiryDate <= threshold;
}

// ---------------------------------------------------------------------------
// expiryStatus
// ---------------------------------------------------------------------------

/**
 * Returns the 4-state classification for a lot's expiry status.
 *
 * | State          | Condition                                             |
 * |----------------|-------------------------------------------------------|
 * | none           | expiry_date IS NULL                                   |
 * | expired        | expiry_date < today                                   |
 * | expiring_soon  | today <= expiry_date <= today + alertDays              |
 * | ok             | expiry_date > today + alertDays                       |
 *
 * Quantity exclusion (qty > 0) is enforced by the caller / query layer.
 */
export function expiryStatus(
  expiryDate: string | null,
  alertDays: number,
  today: string
): ExpiryStatus {
  if (expiryDate === null) return 'none';
  if (isExpired(expiryDate, today)) return 'expired';
  if (isExpiringSoon(expiryDate, alertDays, today)) return 'expiring_soon';
  return 'ok';
}

// ---------------------------------------------------------------------------
// sortByFEFO
// ---------------------------------------------------------------------------

/**
 * Sorts lots in FEFO order (First Expired, First Out) for client display.
 *
 * Order: expiry_date ASC NULLS LAST, then received_date ASC, then created_at ASC.
 *
 * Mirrors the DB ORDER BY clause in create_order and adjust_stock RPCs.
 * Returns a new array — does NOT mutate the input.
 */
export function sortByFEFO<T extends FEFOLot>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    // NULL expiry goes last
    const aNull = a.expiry_date === null;
    const bNull = b.expiry_date === null;

    if (aNull && bNull) {
      // Both null: tiebreak by received_date, then created_at
      return (
        a.received_date.localeCompare(b.received_date) ||
        a.created_at.localeCompare(b.created_at)
      );
    }
    if (aNull) return 1;  // a goes after b
    if (bNull) return -1; // a goes before b

    // Both have dates: compare ASC
    return (
      a.expiry_date!.localeCompare(b.expiry_date!) ||
      a.received_date.localeCompare(b.received_date) ||
      a.created_at.localeCompare(b.created_at)
    );
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function utcToday(): string {
  return dateToIso(new Date());
}

function dateToIso(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return dateToIso(new Date(Date.UTC(year, month - 1, day + days)));
}
