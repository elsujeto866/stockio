/**
 * AR-T29 — Static guard: no direct estado_pago UPDATE outside migrations.
 *
 * Reads source files as strings and asserts:
 *   1. src/lib/data/invoices.ts does NOT contain 'setInvoicePaymentStatus'
 *   2. src/app/(app)/invoices/actions.ts does NOT contain 'setInvoicePaymentStatus'
 *   3. No .ts/.tsx file in src/ contains a direct UPDATE invoices SET estado_pago
 *      (only the migration SQL files may contain such statements)
 *
 * This is a grep-style static check, not a runtime test.
 * Purpose: guarantee that estado_pago and total_paid are ONLY ever written
 * by the record_payment SECURITY DEFINER RPC (REQ-8/D5).
 *
 * Covers: REQ-8/S8-1, S8-2
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC_ROOT = join(process.cwd(), 'src');

function readFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

function walkSrc(dir: string, ext: RegExp, exclude?: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkSrc(full, ext, exclude));
    } else if (ext.test(entry)) {
      if (!exclude?.some((ex) => full.includes(ex))) {
        results.push(full);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// AR-T29 tests
// ---------------------------------------------------------------------------

describe('Guard: no setInvoicePaymentStatus in critical files (AR-T29)', () => {
  it('src/lib/data/invoices.ts does NOT contain setInvoicePaymentStatus', () => {
    const content = readFile('src/lib/data/invoices.ts');
    expect(content).not.toContain('setInvoicePaymentStatus');
  });

  it('src/app/(app)/invoices/actions.ts does NOT contain setInvoicePaymentStatus', () => {
    const content = readFile('src/app/(app)/invoices/actions.ts');
    expect(content).not.toContain('setInvoicePaymentStatus');
  });
});

describe('Guard: no direct UPDATE invoices SET estado_pago in TypeScript files (AR-T29)', () => {
  it('no .ts/.tsx file in src/ contains UPDATE ... SET ... estado_pago', () => {
    // Exclude the guard test itself to avoid self-matching on the pattern string
    const tsFiles = walkSrc(SRC_ROOT, /\.(ts|tsx)$/, ['invoices-guard.test.ts']);
    // Build pattern from parts to avoid self-match inside this source file
    const pattern = new RegExp(['UPDATE', '\\s+', 'invoices', '.*', 'estado_pago'].join(''), 'i');

    const violations: string[] = [];
    for (const file of tsFiles) {
      const content = readFileSync(file, 'utf-8');
      if (pattern.test(content)) {
        violations.push(file.replace(process.cwd(), '.'));
      }
    }

    expect(violations).toHaveLength(0);
  });

  it('no .ts/.tsx file in src/ directly writes total_paid via UPDATE statement', () => {
    // Exclude the guard test itself to avoid self-matching on the pattern string
    const tsFiles = walkSrc(SRC_ROOT, /\.(ts|tsx)$/, ['invoices-guard.test.ts']);
    // Build pattern from parts to avoid self-match inside this source file
    const pattern = new RegExp(['UPDATE', '\\s+', 'invoices', '.*', 'total_paid'].join(''), 'i');

    const violations: string[] = [];
    for (const file of tsFiles) {
      const content = readFileSync(file, 'utf-8');
      if (pattern.test(content)) {
        violations.push(file.replace(process.cwd(), '.'));
      }
    }

    expect(violations).toHaveLength(0);
  });
});
