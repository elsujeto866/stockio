import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/get-user';

type MockClient = Awaited<ReturnType<typeof createClient>>;

describe('requireUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authenticated user without redirecting', async () => {
    const mockUser = { id: 'user-1', email: 'user@example.com' };
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
    } as unknown as MockClient);

    const user = await requireUser();

    expect(user).toEqual(mockUser);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects to /login when no user session exists', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as unknown as MockClient);

    await requireUser();

    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
