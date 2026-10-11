/**
 * Signing in while the page-load sign-in check waits to try again.
 *
 * When GET /api/auth/me got no answer at page load, the check left `loading`
 * and `serverUnreachable` set and waited to try again. Signing in on the
 * sign-in page meanwhile set the user but neither flag, so the page the
 * person landed on said "Can't reach the server" right after the server had
 * accepted their password, until the next try (up to 30 seconds later). A
 * try already on its way when the sign-in succeeded could also land
 * afterwards and sign the page out again.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import type { User } from '@/types/user.types';
import { PlatformRole } from '@/types';

const getCurrentUser = vi.fn();
const login = vi.fn();
const register = vi.fn();
const verifyMFALogin = vi.fn();
const verifyMFALoginWithBackupCode = vi.fn();

vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: (...args: never[]) => getCurrentUser(...args),
    login: (...args: never[]) => login(...args),
    logout: vi.fn(),
    register: (...args: never[]) => register(...args),
    verifyMFALogin: (...args: never[]) => verifyMFALogin(...args),
    verifyMFALoginWithBackupCode: (...args: never[]) => verifyMFALoginWithBackupCode(...args),
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

/** A stand-in for the sign-in, sign-up, code and setup pages: each goes to the dashboard once signed in. */
function SignInPage() {
  const auth = useAuth();
  if (auth.authenticated) return <Navigate to="/dashboard" replace />;
  return (
    <>
      <button onClick={() => { void auth.login('sam@example.test', 'correct horse battery'); }}>Password</button>
      <button onClick={() => { void auth.verifyMFA('123456'); }}>Code</button>
      <button onClick={() => { void auth.verifyMFAWithBackupCode('abcd-efgh'); }}>Backup code</button>
      <button onClick={() => { void auth.register('sam@example.test', 'correct horse battery', 'Sam'); }}>Register</button>
      <button onClick={() => auth.adoptSession(sam)}>Setup</button>
      <p data-testid="flags">{`loading:${auth.loading} unreachable:${auth.serverUnreachable}`}</p>
      <p data-testid="mfa">{auth.mfaPending ? 'waiting for a code' : 'no code asked for'}</p>
    </>
  );
}

function renderSignIn() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/auth/login']}>
        <Routes>
          <Route path="/auth/login" element={<SignInPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><p>Dashboard</p></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

/** Wait for the page-load check to fail and start waiting to try again. */
async function waitForUnreachable() {
  await waitFor(() => expect(screen.getByTestId('flags').textContent).toBe('loading:true unreachable:true'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  login.mockResolvedValue({ message: 'ok', user: sam });
  register.mockResolvedValue({ message: 'ok', user: sam });
  verifyMFALogin.mockResolvedValue({ message: 'ok', user: sam });
  verifyMFALoginWithBackupCode.mockResolvedValue({
    message: 'ok', user: sam, backupCodeUsed: true, remainingBackupCodes: 7,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Each way of signing in: the button pressed, and for the two code sign-ins the one pressed after the password. */
const paths: [string, string, string | undefined][] = [
  ['a password', 'Password', undefined],
  ['a two-factor code', 'Password', 'Code'],
  ['a backup code', 'Password', 'Backup code'],
  ['a new account', 'Register', undefined],
  ['the setup wizard', 'Setup', undefined],
];

describe('signing in while the sign-in check waits to try again', () => {
  it.each(paths)('with %s shows the page, and does not check again', async (_name, first, code) => {
    getCurrentUser.mockRejectedValue(httpError(502));
    renderSignIn();
    await waitForUnreachable();

    if (code !== undefined) login.mockResolvedValueOnce({ mfaRequired: true, message: 'Code needed' });
    fireEvent.click(screen.getByRole('button', { name: first }));
    if (code !== undefined) {
      await waitFor(() => expect(screen.getByTestId('mfa').textContent).toBe('waiting for a code'));
      fireEvent.click(screen.getByRole('button', { name: code }));
    }

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText("Can't reach the server")).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('ignores a check that was on its way when the sign-in succeeded', async () => {
    let answerCheck: (reason: unknown) => void = () => {};
    getCurrentUser
      .mockRejectedValueOnce(httpError(502))
      .mockImplementationOnce(() => new Promise<User>((_resolve, reject) => { answerCheck = reject; }));
    renderSignIn();
    await waitForUnreachable();

    // The second check leaves, and has not been answered yet.
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(getCurrentUser).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Password' }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();

    // It left before the sign-in, without the new session, so it is refused.
    await act(async () => { answerCheck(httpError(401)); });

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(getCurrentUser).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
