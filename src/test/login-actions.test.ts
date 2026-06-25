import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock calls are hoisted before all imports by Vitest.
// This ensures @/lib/supabase/server and next/navigation are mocked
// before @/app/(auth)/login/actions loads and binds its imports.
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { login, signOut } from '@/app/(auth)/login/actions';

type MockClient = Awaited<ReturnType<typeof createClient>>;

describe('login server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /dashboard when credentials are valid', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      },
    } as unknown as MockClient);

    const form = new FormData();
    form.set('email', 'user@example.com');
    form.set('password', 'correct-password');

    await login(form);

    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('returns a typed error object when credentials are invalid', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          error: { message: 'Invalid login credentials' },
        }),
      },
    } as unknown as MockClient);

    const form = new FormData();
    form.set('email', 'user@example.com');
    form.set('password', 'wrong-password');

    const result = await login(form);

    expect(result).toEqual({ error: 'Invalid login credentials' });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('signOut server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls auth.signOut() then redirects to /login', async () => {
    const mockSignOut = vi.fn().mockResolvedValue({});
    vi.mocked(createClient).mockResolvedValue({
      auth: { signOut: mockSignOut },
    } as unknown as MockClient);

    await signOut();

    expect(mockSignOut).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
