/**
 * Signing out is not held up by Paint's draft code that does not load.
 *
 * Signing out drops the user's Paint drafts (signOutPaintDrafts.test.tsx),
 * loading the drafts' code to do it. After an upgrade, a page open from
 * before may ask for a part of the app the server no longer has, and the
 * load may hang or fail. The wait covers the load too: sign-out finishes
 * within 3 seconds whatever it does.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../AuthContext';
import type { User } from '@/types/user.types';
import { PlatformRole } from '@/types';

const h = vi.hoisted(() => ({ getCurrentUser: vi.fn(), logout: vi.fn() }));

vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: (...args: never[]) => h.getCurrentUser(...args),
    logout: (...args: never[]) => h.logout(...args),
    login: vi.fn(),
    register: vi.fn(),
  },
}));
// The drafts' code never arrives.
vi.mock('@/components/campaign/map/paint/paintDrafts', () => new Promise(() => undefined));

const alice: User = {
  id: 'alice',
  email: 'alice@example.test',
  displayName: 'alice',
  platformRole: PlatformRole.USER,
  globalAssetManager: false,
  templateEditor: false,
  mfaEnabled: false,
  mustChangePassword: false,
  avatarUrl: null,
  bio: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
};

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  h.logout.mockResolvedValue(undefined);
  h.getCurrentUser.mockResolvedValue(alice);
});

it('finishes within 3 seconds when the drafts\' code does not load', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.authenticated).toBe(true));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    let done = false;
    act(() => { void result.current.logout().then(() => { done = true; }); });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(done).toBe(true);
    expect(result.current.user).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
