/**
 * Unit tests for next.config.ts remotePatterns — PP-T18.
 *
 * REQ-7 (S7-1..S7-3): Supabase Storage remotePatterns for local dev + prod.
 */

import { describe, it, expect } from 'vitest';

describe('next.config remotePatterns (PP-T18)', () => {
  it('S7-1: includes local Supabase hostname 127.0.0.1 port 54321', async () => {
    const mod = await import('../../next.config');
    const config = mod.default;
    const patterns = config.images?.remotePatterns ?? [];

    const localEntry = patterns.find(
      (p: { hostname?: string; port?: string }) =>
        p.hostname === '127.0.0.1' && p.port === '54321'
    );
    expect(localEntry).toBeDefined();
    expect(localEntry?.pathname).toBe('/storage/v1/object/**');
  });

  it('S7-2: includes prod https entry with env-derived hostname', async () => {
    const mod = await import('../../next.config');
    const config = mod.default;
    const patterns = config.images?.remotePatterns ?? [];

    const httpsEntry = patterns.find(
      (p: { protocol?: string }) => p.protocol === 'https'
    );
    expect(httpsEntry).toBeDefined();
    expect(httpsEntry?.pathname).toBe('/storage/v1/object/**');
  });

  it('S7-3: no entry has a search property (would block ?token= signed URLs)', async () => {
    const mod = await import('../../next.config');
    const config = mod.default;
    const patterns = config.images?.remotePatterns ?? [];

    for (const p of patterns as Array<Record<string, unknown>>) {
      expect('search' in p).toBe(false);
    }
  });

  it('has at least 2 remotePattern entries (local + prod)', async () => {
    const mod = await import('../../next.config');
    const config = mod.default;
    const patterns = config.images?.remotePatterns ?? [];
    expect(patterns.length).toBeGreaterThanOrEqual(2);
  });
});
