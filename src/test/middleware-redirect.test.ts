import { describe, it, expect } from 'vitest';
import { resolveRedirect } from '@/lib/supabase/middleware';

describe('resolveRedirect — pure redirect-decision helper', () => {
  it('redirects unauthenticated user away from a protected route', () => {
    expect(resolveRedirect('/dashboard', false)).toBe('/login');
  });

  it('redirects unauthenticated user away from any nested protected path', () => {
    expect(resolveRedirect('/orders/123', false)).toBe('/login');
  });

  it('redirects authenticated user away from /login', () => {
    expect(resolveRedirect('/login', true)).toBe('/dashboard');
  });

  it('allows an authenticated user to stay on a protected route', () => {
    expect(resolveRedirect('/dashboard', true)).toBeNull();
  });

  it('allows an unauthenticated user to stay on /login', () => {
    expect(resolveRedirect('/login', false)).toBeNull();
  });

  it('does not intercept _next static asset requests', () => {
    expect(resolveRedirect('/_next/static/chunk.js', false)).toBeNull();
  });

  it('does not intercept favicon requests', () => {
    expect(resolveRedirect('/favicon.ico', false)).toBeNull();
  });
});
