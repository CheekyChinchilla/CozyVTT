/**
 * Only the server saying "not signed in" signs the page out.
 *
 * The sign-in check at page load took any failure of GET /api/auth/me for
 * "not signed in": during a backend restart, a 502 from the proxy or a
 * timeout sent a valid sign-in to the login page, and the login page never
 * checked again. After a profile save, a failed re-read of the user called
 * logout, which ended the server session for good if the request got
 * through. Now a 401 is the only answer that signs the page out; anything
 * else says the server cannot be reached and tries again.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, act, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import type { User } from '@/types/user.types';
import { PlatformRole } from '@/types';

const getCurrentUser = vi.fn();
const logout = vi.fn();

vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: (...args: never[]) => getCurrentUser(...args),
    login: vi.fn(),
    logout: (...args: never[]) => logout(...args),
    register: vi.fn(),
  },
}));

const sam: User = {
  id: 'sam',
  email: 'sam@example.test',
  displayName: 'Sam',
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

/** A failed request as the API client throws it. */
const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: {} } });
const networkError = () => Object.assign(new Error('Network Error'), { request: {} });

function renderDashboard() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><p>Dashboard</p></ProtectedRoute>} />
          <Route path="/auth/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  logout.mockResolvedValue(undefined);
});

describe('the sign-in check at page load', () => {
  it.each([
    ['a 502 from the proxy', () => httpError(502)],
    ['a 500', () => httpError(500)],
    ['a network error', networkError],
  ])('on %s says the server cannot be reached, and stays off the login page', async (_name, failure) => {
    getCurrentUser.mockRejectedValue(failure());
    renderDashboard();

    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('signs in once the server answers again', async () => {
    getCurrentUser.mockRejectedValueOnce(httpError(502)).mockResolvedValue(sam);
    renderDashboard();
    await screen.findByText("Can't reach the server");

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('tries again by itself', async () => {
    getCurrentUser.mockRejectedValueOnce(networkError()).mockResolvedValue(sam);
    renderDashboard();
    await screen.findByText("Can't reach the server");

    expect(await screen.findByText('Dashboard', undefined, { timeout: 4000 })).toBeInTheDocument();
  });

  it('on a 401 goes to the login page', async () => {
    getCurrentUser.mockRejectedValue(httpError(401));
    renderDashboard();

    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });
});

describe('re-reading the user after a profile change', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

  it('keeps the user signed in, and the server session, when the read fails for another reason', async () => {
    getCurrentUser.mockResolvedValueOnce(sam).mockRejectedValue(httpError(502));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authenticated).toBe(true));

    await act(async () => { await result.current.refreshUser(); });

    expect(logout).not.toHaveBeenCalled();
    expect(result.current.authenticated).toBe(true);
    expect(result.current.user?.id).toBe('sam');
  });

  it('signs the page out on a 401, without asking the server to end a session it no longer has', async () => {
    getCurrentUser.mockResolvedValueOnce(sam).mockRejectedValue(httpError(401));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authenticated).toBe(true));

    await act(async () => { await result.current.refreshUser(); });

    expect(result.current.authenticated).toBe(false);
    expect(logout).not.toHaveBeenCalled();
  });
});
