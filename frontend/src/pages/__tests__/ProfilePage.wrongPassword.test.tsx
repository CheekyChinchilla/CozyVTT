/**
 * A mistyped current password on the Profile page is said on the form.
 *
 * The server answers it 401 "Current password is incorrect". The API client
 * took that for a lost sign-in and sent the page to sign in, so the user saw
 * no error, lost the form, and could not tell whether the password had
 * changed. The request here goes through the real API client and service,
 * with only the transport stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const handleUnauthorized = vi.fn();
vi.mock('@/services/unsavedWork', () => ({
  handleUnauthorized: (...args: unknown[]) => handleUnauthorized(...args),
}));

import { api } from '@/services/api';
import { authService } from '@/services/auth.service';
import ProfilePage from '../ProfilePage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'sam@example.test', displayName: 'Sam', platformRole: 'USER', mfaEnabled: false, avatarUrl: null },
    logout: vi.fn(),
    refreshUser: vi.fn(),
    changePassword: (current: string, next: string) => authService.changePassword(current, next),
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ appearance: null, applyUserPreferences: vi.fn() }),
}));
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/components/profile/MFASection', () => ({ default: () => null }));

const client = (api as unknown as { client: AxiosInstance }).client;
const originalAdapter = client.defaults.adapter;

afterEach(() => {
  client.defaults.adapter = originalAdapter;
  window.history.pushState({}, '', '/');
});

describe('Change Password with a wrong current password', () => {
  it('stays on the page and shows the server\'s message', async () => {
    window.history.pushState({}, '', '/profile');
    client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === '/api/auth/change-password') {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
          status: 401,
          statusText: 'Unauthorized',
          data: { error: 'Authentication Failed', message: 'Current password is incorrect' },
          headers: {},
          config,
        });
      }
      return { data: { preferences: {} }, status: 200, statusText: 'OK', headers: {}, config };
    };

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <ProfilePage />
      </MemoryRouter>
    );
    await userEvent.type(screen.getByPlaceholderText('Current password'), 'Mistyped1!Password');
    await userEvent.type(screen.getByPlaceholderText('At least 12 characters'), 'Another1!Password');
    await userEvent.type(screen.getByPlaceholderText('Repeat new password'), 'Another1!Password');
    await userEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    expect(handleUnauthorized).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Current password')).toHaveValue('Mistyped1!Password');
  });
});
