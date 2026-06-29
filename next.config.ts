/**
 * next.config.ts — Next.js configuration.
 *
 * PP-T19: REQ-7 (S7-1..S7-3); Design §8.
 *
 * remotePatterns covers both local Supabase Storage and the production host.
 * NOTE: product photos render with `unoptimized` (Design D4), so remotePatterns
 * is NOT the active guard for them — it is configured for correctness and
 * future optimized usage. Omitting `search` allows ?token= query strings
 * from Supabase signed URLs to pass through (a search: '' would BLOCK them).
 */

import type { NextConfig } from 'next';

// Derive the production Supabase Storage hostname from the env var.
// Falls back to 127.0.0.1 (same as local) when env is absent (build time safety).
const supaHost = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
).hostname;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // S7-1: local Supabase Storage (supabase start)
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/**',
      },
      // S7-2: production Supabase Storage (env-derived hostname)
      {
        protocol: 'https',
        hostname: supaHost,
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

export default nextConfig;
