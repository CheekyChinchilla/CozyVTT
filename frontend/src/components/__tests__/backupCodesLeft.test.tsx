/**
 * The app says how many MFA backup codes are left.
 *
 * After a sign-in with a backup code the server says how many remain, with a
 * warning at three or fewer, and the app only wrote it to the browser
 * console, so someone could spend their last code without knowing. The next
 * page now says so, and the Profile page's two-factor section shows the
 * count at any time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import MFASection from '@/components/profile/MFASection';
import type { AuthContextType, User } from '@/types/user.types';
import { PlatformRole } from '@/types';

const getCurrentUser = vi.fn();
const login = vi.fn();
const verifyMFALoginWithBackupCode = vi.fn();
const completeMFASetup = vi.fn();
const disableMFA = vi.fn();
vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: (...args: never[]) => getCurrentUser(...args),
    login: (...args: never[]) => login(...args),
    logout: vi.fn(),
    register: vi.fn(),
    verifyMFALoginWithBackupCode: (...args: never[]) => verifyMFALoginWithBackupCode(...args),
    completeMFASetup: (...args: never[]) => completeMFASetup(...args),
    disableMFA: (...args: never[]) => disableMFA(...args),
  },
}));

const sam: User = {
  id: 'sam',
  email: 'sam@example.test',
  displayName: 'Sam',
  platformRole: PlatformRole.USER,
  globalAssetManager: false,
  templateEditor: false,
  mfaEnabled: true,
  mustChangePassword: false,
  avatarUrl: null,
  bio: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
};

let auth: AuthContextType | null = null;
function Probe() {
  auth = useAuth();
  return null;
}

/** The sign-in page as far as this test needs it: it moves on once signed in. */
function LoginStub() {
  const { authenticated } = useAuth();
  return authenticated ? <Navigate to="/dashboard" replace /> : <p>Login page</p>;
}

async function signInWithBackupCode(remaining: number) {
  verifyMFALoginWithBackupCode.mockResolvedValue({
    message: 'Login successful',
    user: { ...sam, mfaBackupCodesRemaining: remaining },
    mustChangePassword: false,
    backupCodeUsed: true,
    remainingBackupCodes: remaining,
    ...(remaining <= 3 ? { warning: `You have ${remaining} backup codes remaining. Regenerate them in your profile settings.` } : {}),
  });
  render(
    <AuthProvider>
      <Probe />
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><p>Dashboard</p></ProtectedRoute>} />
          <Route path="/auth/login" element={<LoginStub />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
  await screen.findByText('Login page');
  await act(async () => { await auth!.login('sam@example.test', 'Another1!Password'); });
  await act(async () => { await auth!.verifyMFAWithBackupCode('ABCD2345'); });
  await screen.findByText('Dashboard');
}

beforeEach(() => {
  vi.clearAllMocks();
  auth = null;
  getCurrentUser.mockRejectedValue(Object.assign(new Error('Unauthorized'), { response: { status: 401, data: {} } }));
  login.mockResolvedValue({ mfaRequired: true, message: 'MFA verification required. Please enter your TOTP code.' });
});

describe('after a sign-in with a backup code', () => {
  it('warns when three or fewer are left, and points to where new ones are made', async () => {
    await signInWithBackupCode(2);

    expect(screen.getByRole('status')).toHaveTextContent('You signed in with a backup code. Only 2 backup codes are left: make new ones from Backup Codes on your Profile page.');
    expect(screen.getByRole('link', { name: 'Profile page' })).toHaveAttribute('href', '/profile');
  });

  it('says how many are left otherwise, and can be dismissed', async () => {
    await signInWithBackupCode(7);

    expect(screen.getByRole('status')).toHaveTextContent('You signed in with a backup code. 7 backup codes are left.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says when none are left', async () => {
    await signInWithBackupCode(0);

    expect(screen.getByRole('status')).toHaveTextContent('You signed in with your last backup code: make new ones from Backup Codes on your Profile page.');
  });
});

describe("the Profile page's two-factor section", () => {
  it('shows how many backup codes are left', async () => {
    getCurrentUser.mockResolvedValue({ ...sam, mfaBackupCodesRemaining: 4 });
    render(
      <AuthProvider>
        <MemoryRouter><MFASection /></MemoryRouter>
      </AuthProvider>
    );

    expect(await screen.findByText('4 of 10 backup codes left')).toBeInTheDocument();
  });

  it('shows the new codes once two-factor authentication is turned off and on again', async () => {
    getCurrentUser.mockResolvedValue({ ...sam, mfaBackupCodesRemaining: 2 });
    disableMFA.mockResolvedValue(undefined);
    completeMFASetup.mockResolvedValue({
      message: 'MFA enabled successfully',
      backupCodes: Array.from({ length: 10 }, (_, i) => `CODE-${i}`),
    });
    render(
      <AuthProvider>
        <Probe />
        <MemoryRouter><MFASection /></MemoryRouter>
      </AuthProvider>
    );
    await screen.findByText('2 of 10 backup codes left');

    await act(async () => { await auth!.disableMFA('Another1!Password', '123456'); });
    expect(auth!.user?.mfaBackupCodesRemaining).toBeNull();

    await act(async () => { await auth!.completeMFASetup('654321'); });
    expect(await screen.findByText('10 of 10 backup codes left')).toBeInTheDocument();
  });
});
