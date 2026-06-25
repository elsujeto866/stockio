import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js middleware — runs on every matched request before rendering.
 * Delegates to updateSession() which:
 *  1. Refreshes the Supabase session cookie (getUser() — never getSession())
 *  2. Redirects unauthenticated users away from protected routes
 *  3. Redirects authenticated users away from /login
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (Next.js static assets)
     * - _next/image   (Next.js image optimisation endpoint)
     * - favicon.ico   (browser favicon)
     * - public image files (svg, png, jpg, jpeg, gif, webp)
     *
     * Ref: https://supabase.com/docs/guides/auth/server-side/nextjs
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
