/**
 * Taking up a session the server created outside the login form.
 *
 * The setup wizard finishes by telling the admin they will be "automatically
 * logged in and redirected to the dashboard". They were not: the page called
 * `refreshUser()`, which returns early unless the context already believes it
 * is authenticated — and straight after setup it does not. No request was made,
 * the navigation hit the route guard with an empty context, and a brand-new
 * admin landed on the login screen to type the password they had just chosen.
 *
 * The first test here is the one that matters: it pins the early return, so
 * that anyone tempted to "fix" the wizard by calling `refreshUser` again finds
 * out immediately why that cannot work.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../AuthContext';
import type { User } from '@/types/user.types';
import { PlatformRole } from '@/types';

const getCurrentUser = vi.fn();

vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: (...args: never[]) => getCurrentUser(...args),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  },
}));

const admin: User = {
  id: 'admin-1',
  email: 'admin@example.test',
  displayName: 'Fresh Admin',
  platformRole: PlatformRole.ADMIN,
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

describe('adopting a server-established session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The provider checks /api/auth/me on mount; before setup there is nobody.
    getCurrentUser.mockRejectedValue(new Error('not authenticated'));
  });

  it('refreshUser does nothing while the context thinks nobody is signed in', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    getCurrentUser.mockClear();

    await act(async () => {
      await result.current.refreshUser();
    });

    // No request, and still signed out — this is why the wizard's redirect failed.
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(result.current.authenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('adoptSession signs the caller in from a user the server returned', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.adoptSession(admin);
    });

    expect(result.current.authenticated).toBe(true);
    expect(result.current.user).toEqual(admin);
    expect(result.current.mfaPending).toBe(false);
  });

  it('carries a forced password change through', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.adoptSession({ ...admin, mustChangePassword: true });
    });

    expect(result.current.mustChangePassword).toBe(true);
  });

  it('leaves refreshUser usable once a session has been adopted', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.adoptSession(admin);
    });

    const renamed = { ...admin, displayName: 'Renamed Admin' };
    getCurrentUser.mockResolvedValue(renamed);

    await act(async () => {
      await result.current.refreshUser();
    });

    expect(getCurrentUser).toHaveBeenCalled();
    expect(result.current.user?.displayName).toBe('Renamed Admin');
  });
});
