'use client';

/**
 * BackfillNotice — dismissible operator notice (REQ-8).
 *
 * Appears when 'adjustment' lots with expiry_date=NULL exist (backfilled lots from
 * migration 100100). Prompts the operator to review and enter real expiry dates.
 *
 * Dismissed state is persisted in localStorage (per-user, per-device).
 * Key: 'stockio:backfill-notice-dismissed'
 *
 * Lazy useState initializer reads localStorage on the client; server always
 * returns false (not dismissed). A brief flash is acceptable because this notice
 * targets operators with existing legacy data, not first-time users.
 */

import { useState } from 'react';

const STORAGE_KEY = 'stockio:backfill-notice-dismissed';

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

interface Props {
  /** Whether backfill lots (adjustment + null expiry) exist for the current tenant. */
  show: boolean;
}

export function BackfillNotice({ show }: Props) {
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  if (!show || dismissed) return null;

  function handleDismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
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
      <p className="flex-1">
        Algunos lotes de inventario existentes no tienen fecha de vencimiento. Revisá cada producto
        y cargá la fecha de vencimiento real en los lotes correspondientes.
      </p>
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
