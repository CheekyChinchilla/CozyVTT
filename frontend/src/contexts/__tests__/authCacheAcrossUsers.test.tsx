/**
 * What one account loaded is not shown to the next one to sign in.
 *
 * The lists the pages fetch (campaigns, characters, invitations) are cached
 * under keys that name no user, and the cache outlives signing out. So on a
 * shared computer the next person to sign in in the same tab was shown the
 * previous person's campaigns, characters and invitations, for 30 seconds
 * with no refetch at all. Signing out now empties the cache, and so does a
 * sign-in as a different account.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../AuthContext';
import { queryClient } from '@/lib/queryClient';
import { queryKeys } from '@/hooks/queries';
import type { User } from '@/types/user.types';
import { PlatformRole } from '@/types';

const getCurrentUser = vi.fn();
const login = vi.fn();
const logout = vi.fn();

vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: (...args: never[]) => getCurrentUser(...args),
    login: (...args: never[]) => login(...args),
    logout: (...args: never[]) => logout(...args),
    register: vi.fn(),
  },
}));

const person = (id: string): User => ({
  id,
  email: `${id}@example.test`,
  displayName: id,
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
});

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

function cacheAlicesLists() {
  queryClient.setQueryData(queryKeys.campaigns, [{ id: 'alice-campaign', name: "Alice's table" }]);
  queryClient.setQueryData(queryKeys.characters, [{ id: 'alice-hero', name: 'Alice the Bold' }]);
  queryClient.setQueryData(queryKeys.pendingInvitations, [{ id: 'invite-for-alice' }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  logout.mockResolvedValue(undefined);
});

describe('the cached lists', () => {
  it('are emptied when the user signs out', async () => {
    getCurrentUser.mockResolvedValue(person('alice'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    cacheAlicesLists();

    await act(async () => { await result.current.logout(); });

    expect(queryClient.getQueryData(queryKeys.campaigns)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.characters)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.pendingInvitations)).toBeUndefined();
  });

  it('are emptied when a different account signs in', async () => {
    getCurrentUser.mockResolvedValue(person('alice'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    cacheAlicesLists();

    login.mockResolvedValue({ message: 'Login successful', user: person('bob'), mustChangePassword: false });
    await act(async () => { await result.current.login('bob@example.test', 'Another1!Password'); });

    expect(result.current.user?.id).toBe('bob');
    expect(queryClient.getQueryData(queryKeys.campaigns)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.characters)).toBeUndefined();
  });

  it('are kept when the same account signs in again', async () => {
    getCurrentUser.mockResolvedValue(person('alice'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    cacheAlicesLists();

    login.mockResolvedValue({ message: 'Login successful', user: person('alice'), mustChangePassword: false });
    await act(async () => { await result.current.login('alice@example.test', 'Another1!Password'); });

    expect(queryClient.getQueryData(queryKeys.campaigns)).toEqual([{ id: 'alice-campaign', name: "Alice's table" }]);
  });
});
