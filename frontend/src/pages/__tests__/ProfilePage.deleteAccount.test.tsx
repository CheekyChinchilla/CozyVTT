/**
 * Deleting your account says plainly what goes and what stays.
 *
 * The confirmation said uploaded files "stay where they are", while the
 * avatar and personal files nothing uses are now deleted with the account.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProfilePage from '../ProfilePage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'sam@example.test', displayName: 'Sam', platformRole: 'USER', mfaEnabled: false, avatarUrl: null },
    logout: vi.fn(),
    refreshUser: vi.fn(),
    changePassword: vi.fn(),
  }),
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
  profileService: { deleteAccount: vi.fn(), updateProfile: vi.fn(), uploadAvatar: vi.fn() },
}));

describe('the Delete Account confirmation', () => {
  it('says the avatar and unused personal files are deleted, and what stays', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete Account' }));

    expect(screen.getByText('Your avatar, and the personal files you uploaded that nothing uses')).toBeInTheDocument();
    expect(screen.getByText(/files you uploaded into a campaign and documents you shared into one stay there/)).toBeInTheDocument();
    expect(screen.getByText(/A personal file a campaign still uses stays on the server with no owner/)).toBeInTheDocument();
  });
});
