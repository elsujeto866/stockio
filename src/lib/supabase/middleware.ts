import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Pure redirect-decision helper — unit-testable without any Next.js context.
 *
 * @param pathname  The request pathname (e.g. '/dashboard', '/login')
 * @param hasUser   Whether a valid authenticated user exists in the session
 * @returns         Redirect target path, or null if the request should proceed
 */
export function resolveRedirect(pathname: string, hasUser: boolean): string | null {
  const isPublicPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico';

  if (!hasUser && !isPublicPath) return '/login';
  if (hasUser && pathname === '/login') return '/dashboard';
  return null;
}

/**
 * Refreshes the Supabase session cookie and enforces route protection.
 *
 * IMPORTANT: always calls getUser() — validates with the Auth server.
 * Never uses getSession() which reads only from the stale cookie.
 *
 * Called by root middleware.ts.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: always use getUser() here. getSession() relies on the
  // cookie alone and can be spoofed by a client. getUser() validates
  // the token with Supabase Auth every time.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectPath = resolveRedirect(request.nextUrl.pathname, !!user);
  if (redirectPath) {
    const url = request.nextUrl.clone();
    url.pathname = redirectPath;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
