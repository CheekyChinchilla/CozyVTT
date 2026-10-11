/**
 * An administrator without two-factor authentication sees a banner saying when it becomes required.
 *
 * The server gives such an administrator `adminMfaDeadline` with their user.
 * Every signed-in page shows a banner above its content with that date and a
 * link to set MFA up; ordinary users, and administrators with MFA on, see no
 * banner. After the deadline the server refuses everything but enrolment and
 * the app sends the administrator to the setup page.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { PlatformRole, type User, type AuthContextType } from '@/types/user.types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/contexts/AuthContext';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

const base: User = {
  id: 'user-1',
  email: 'alice@example.com',
  displayName: 'Alice',
  platformRole: PlatformRole.ADMIN,
  globalAssetManager: false,
  templateEditor: false,
  mfaEnabled: false,
  avatarUrl: null,
  bio: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastLoginAt: null,
};

function signedInAs(user: User) {
  mockUseAuth.mockReturnValue({
    user,
    loading: false,
    authenticated: true,
    mfaPending: false,
    mustChangePassword: false,
  } as unknown as AuthContextType);
  return render(
    <MemoryRouter>
      <ProtectedRoute>
        <p>the page</p>
      </ProtectedRoute>
    </MemoryRouter>
  );
}

describe('the administrator two-factor banner', () => {
  it('tells an administrator without MFA when it becomes required, and links to setup, above the page', () => {
    const deadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    signedInAs({ ...base, adminMfaDeadline: deadline });

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/administrator accounts must use two-factor authentication/i);
    expect(banner).toHaveTextContent(new Date(deadline).toLocaleDateString());
    expect(screen.getByRole('link', { name: /set it up now/i })).toHaveAttribute('href', '/auth/mfa-setup');
    expect(screen.getByText('the page')).toBeInTheDocument();
  });

  it('shows nothing to an administrator with MFA on, or to an ordinary user', () => {
    signedInAs({ ...base, mfaEnabled: true, adminMfaDeadline: null });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    signedInAs({ ...base, platformRole: PlatformRole.USER, adminMfaDeadline: null });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
