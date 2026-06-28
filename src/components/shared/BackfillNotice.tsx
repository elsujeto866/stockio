'use client';

/**
 * BackfillNotice — dismissible operator notice.
 *
 * AR-T28: Extended with optional `storageKey` and `message` props.
 *   - `storageKey` defaults to 'stockio:backfill-notice-dismissed' (expiry-batches key)
 *     for backward compatibility. AR receivables uses 'stockio:ar-backfill-notice-dismissed'.
 *   - `message` allows per-usage custom text while preserving the default expiry message.
 *
 * Dismissed state is persisted in localStorage (per-user, per-device).
 * Lazy useState initializer reads localStorage on the client; server always
 * returns false (not dismissed). A brief flash is acceptable because this notice
 * targets operators with existing legacy data, not first-time users.
 *
 * ⚠️ LINT GOTCHA: uses lazy useState(readDismissed) — NOT useEffect(() => setState(...)).
 */

import { useState } from 'react';

const DEFAULT_STORAGE_KEY = 'stockio:backfill-notice-dismissed';

const DEFAULT_MESSAGE =
  'Algunos lotes de inventario existentes no tienen fecha de vencimiento. Revisá cada producto y cargá la fecha de vencimiento real en los lotes correspondientes.';

function readDismissed(storageKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

interface Props {
  /** Whether the notice should be shown at all (server-side flag). */
  show: boolean;
  /**
   * localStorage key for per-user dismiss state.
   * Defaults to 'stockio:backfill-notice-dismissed' (expiry-batches key — backward compatible).
   * AR receivables must use 'stockio:ar-backfill-notice-dismissed' to avoid cross-contamination.
   */
  storageKey?: string;
  /** Custom notice message. Defaults to the expiry-batches message. */
  message?: string;
}

export function BackfillNotice({
  show,
  storageKey = DEFAULT_STORAGE_KEY,
  message = DEFAULT_MESSAGE,
}: Props) {
  // Lazy initializer: reads localStorage once on mount (no useEffect → setState).
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed(storageKey));

  if (!show || dismissed) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // ignore storage errors
    }
    setDismissed(true);
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800"
    >
      <span className="mt-0.5 shrink-0">&#9888;</span>
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Descartar aviso"
        className="shrink-0 rounded p-1 hover:bg-amber-100 transition-colors"
      >
        &#x2715;
      </button>
    </div>
  );
}
