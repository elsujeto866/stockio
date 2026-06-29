/**
 * Unit tests for getSignedUrls helper.
 *
 * PP-T6: REQ-4 (S4-1, S4-2, S4-3) — batch signed URLs, no N+1, 1h TTL.
 * Mocks supabase.storage; NO real network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSignedUrls } from '@/lib/data/products';

// ---------------------------------------------------------------------------
// Mock Supabase client factory
// ---------------------------------------------------------------------------
function makeSupabase(
  result: { data: unknown; error: unknown } = { data: [], error: null }
) {
  const createSignedUrlsMock = vi.fn().mockResolvedValue(result);
  const supabase = {
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrls: createSignedUrlsMock,
      }),
    },
  };
  return { supabase, createSignedUrlsMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSignedUrls', () => {
  it('S4-1: N paths → exactly ONE createSignedUrls call with all N paths', async () => {
    const paths = ['a/1.jpg', 'b/2.jpg', 'c/3.jpg'];
    const { supabase, createSignedUrlsMock } = makeSupabase({
      data: paths.map((p) => ({ path: p, signedUrl: `https://cdn/${p}`, error: null })),
      error: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getSignedUrls(supabase as any, paths);

    expect(createSignedUrlsMock).toHaveBeenCalledTimes(1);
    expect(createSignedUrlsMock).toHaveBeenCalledWith(paths, 3600);
  });

  it('S4-2: empty array → createSignedUrls NOT called; returns empty Map', async () => {
    const { supabase, createSignedUrlsMock } = makeSupabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getSignedUrls(supabase as any, []);

    expect(createSignedUrlsMock).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it('S4-3: expiresIn argument is 3600 (1 hour TTL)', async () => {
    const paths = ['t/1.jpg'];
    const { supabase, createSignedUrlsMock } = makeSupabase({
      data: [{ path: 't/1.jpg', signedUrl: 'https://x', error: null }],
      error: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getSignedUrls(supabase as any, paths);

    const [, expiresIn] = createSignedUrlsMock.mock.calls[0];
    expect(expiresIn).toBe(3600);
  });

  it('builds Map path→signedUrl correctly', async () => {
    const paths = ['a/1.jpg', 'b/2.jpg'];
    const { supabase } = makeSupabase({
      data: [
        { path: 'a/1.jpg', signedUrl: 'https://cdn/a1', error: null },
        { path: 'b/2.jpg', signedUrl: 'https://cdn/b2', error: null },
      ],
      error: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getSignedUrls(supabase as any, paths);

    expect(result.get('a/1.jpg')).toBe('https://cdn/a1');
    expect(result.get('b/2.jpg')).toBe('https://cdn/b2');
  });

  it('filters null/falsy values before calling createSignedUrls', async () => {
    const { supabase, createSignedUrlsMock } = makeSupabase({
      data: [{ path: 'a/1.jpg', signedUrl: 'https://cdn/a', error: null }],
      error: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getSignedUrls(supabase as any, ['a/1.jpg', '', null as unknown as string]);

    const [passedPaths] = createSignedUrlsMock.mock.calls[0];
    expect(passedPaths).toEqual(['a/1.jpg']);
  });

  it('deduplicates paths before calling createSignedUrls', async () => {
    const paths = ['a/1.jpg', 'a/1.jpg', 'b/2.jpg'];
    const { supabase, createSignedUrlsMock } = makeSupabase({
      data: [
        { path: 'a/1.jpg', signedUrl: 'https://cdn/a', error: null },
        { path: 'b/2.jpg', signedUrl: 'https://cdn/b', error: null },
      ],
      error: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getSignedUrls(supabase as any, paths);

    const [passedPaths] = createSignedUrlsMock.mock.calls[0];
    expect(passedPaths).toEqual(['a/1.jpg', 'b/2.jpg']);
  });

  it('returns empty Map on storage error (graceful degrade)', async () => {
    const { supabase } = makeSupabase({ data: null, error: new Error('storage failure') });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getSignedUrls(supabase as any, ['a/1.jpg']);

    expect(result.size).toBe(0);
  });

  it('skips items with per-item error flag', async () => {
    const { supabase } = makeSupabase({
      data: [
        { path: 'a/1.jpg', signedUrl: null, error: { message: 'not found' } },
        { path: 'b/2.jpg', signedUrl: 'https://cdn/b', error: null },
      ],
      error: null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getSignedUrls(supabase as any, ['a/1.jpg', 'b/2.jpg']);

    expect(result.has('a/1.jpg')).toBe(false);
    expect(result.get('b/2.jpg')).toBe('https://cdn/b');
  });
});
