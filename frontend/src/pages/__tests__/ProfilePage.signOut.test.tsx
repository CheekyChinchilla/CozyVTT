/**
 * Signing out, or deleting the account, from the profile page opens the
 * plain sign-in page.
 *
 * Both handlers sign out and then navigate. With the router's transitions on,
 * React first renders the profile page with no one signed in, and the guard
 * around it replaces the move with a sign-in page that returns to the
 * profile. The next person to sign in in that browser then lands on the
 * profile page. These render the page in the app's own router.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import AppRouter from '@/AppRouter';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProfilePage from '../ProfilePage';
import { profileService } from '@/services/profile.service';

const sam = {
  id: 'u-1',
  email: 'sam@example.test',
  displayName: 'Sam',
  platformRole: 'USER',
  mfaEnabled: false,
  avatarUrl: null,
};

const AuthState = createContext<unknown>(null);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useContext(AuthState),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ appearance: null, applyUserPreferences: vi.fn() }),
}));
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/components/profile/MFASection', () => ({ default: () => null }));
vi.mock('@/services/api', () => {
  const client = { getUserPreferences: vi.fn(async () => ({})), updateUserPreferences: vi.fn() };
  return { api: client, default: client };
});
vi.mock('@/services/profile.service', () => ({
  profileService: { deleteAccount: vi.fn(async () => undefined), updateProfile: vi.fn(), uploadAvatar: vi.fn() },
}));

/** A sign-in that ends a moment after logout is called, as the real one does after its request. */
function SignedIn({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<typeof sam | null>(sam);
  const value = {
    user,
    authenticated: user !== null,
    loading: false,
    serverUnreachable: false,
    mustChangePassword: false,
    backupCodesLeft: null,
    dismissBackupCodesLeft: vi.fn(),
    retryAuthCheck: vi.fn(),
    refreshUser: vi.fn(),
    changePassword: vi.fn(),
    logout: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      setUser(null);
    },
  };
  return <AuthState.Provider value={value}>{children}</AuthState.Provider>;
}

function renderProfile() {
  render(
    <AppRouter>
      <SignedIn>
        <Routes>
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route path="/auth/login" element={<p>Sign-in page</p>} />
        </Routes>
      </SignedIn>
    </AppRouter>
  );
}

/** Where the browser ends up once every redirect has run. */
async function settledAddress() {
  await screen.findByText('Sign-in page');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return `${window.location.pathname}${window.location.search}`;
}

describe('leaving the profile page signed out', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/profile');
  });

  it('opens the sign-in page with no return address after Sign Out', async () => {
    renderProfile();
    await userEvent.click(screen.getByRole('button', { name: 'Sign Out' }));

    expect(await settledAddress()).toBe('/auth/login');
  });

  it('opens the sign-in page with no return address after deleting the account', async () => {
    renderProfile();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    await userEvent.type(screen.getByPlaceholderText('DELETE'), 'DELETE');
    await userEvent.type(screen.getByPlaceholderText('Enter your password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Delete My Account' }));

    expect(await settledAddress()).toBe('/auth/login');
    expect(profileService.deleteAccount).toHaveBeenCalledWith('correct horse');
  });
});
