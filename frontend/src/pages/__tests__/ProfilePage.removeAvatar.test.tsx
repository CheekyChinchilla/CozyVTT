/**
 * An avatar can be removed from the Profile page.
 *
 * There was no way to clear an avatar in the app: uploading another only
 * added a picture, and deleting it from the asset library brought the one
 * before it back. Remove Avatar clears it, and the server deletes the
 * picture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import ProfilePage from '../ProfilePage';

const refreshUser = vi.fn();
let avatarUrl: string | null = '/api/assets/avatars/u-1';
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'sam@example.test', displayName: 'Sam', platformRole: 'USER', mfaEnabled: false, avatarUrl },
    logout: vi.fn(),
    refreshUser,
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

const removeAvatar = vi.fn();
vi.mock('@/services/profile.service', () => ({
  profileService: { removeAvatar: (userId: string) => removeAvatar(userId) },
  default: { removeAvatar: (userId: string) => removeAvatar(userId) },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  removeAvatar.mockReset().mockResolvedValue(undefined);
  refreshUser.mockReset().mockResolvedValue(undefined);
  avatarUrl = '/api/assets/avatars/u-1';
});

describe('Remove Avatar', () => {
  it('clears the avatar and reloads the profile', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Avatar' }));

    expect(removeAvatar).toHaveBeenCalledWith('u-1');
    await vi.waitFor(() => expect(refreshUser).toHaveBeenCalled());
    expect(await screen.findByText('Avatar removed')).toBeInTheDocument();
  });

  it('is not offered without an avatar', () => {
    avatarUrl = null;
    renderPage();
    expect(screen.queryByRole('button', { name: 'Remove Avatar' })).not.toBeInTheDocument();
  });
});
