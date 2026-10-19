/**
 * The display name box on Profile is named and counts to the server's limit,
 * and takes a one-letter name as the server does.
 *
 * Its label was not tied to the box, so a screen reader named it by nothing,
 * and its counter said "/50" in a number of its own.
 */
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import ProfilePage from '../ProfilePage';
import { DISPLAY_NAME_MAX_LENGTH } from '@/constants/accountLimits';

const refreshUser = vi.fn().mockResolvedValue(undefined);
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'sam@example.test', displayName: 'Sam', platformRole: 'USER', mfaEnabled: false, avatarUrl: null },
    logout: vi.fn(),
    refreshUser,
    changePassword: vi.fn(),
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ appearance: null, applyUserPreferences: vi.fn() }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/components/profile/MFASection', () => ({ default: () => null }));
const updateProfile = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/profile.service', () => ({
  profileService: { updateProfile: (...args: unknown[]) => updateProfile(...args) },
  default: { updateProfile: (...args: unknown[]) => updateProfile(...args) },
}));

it('names the box, counts to the limit and saves a one-letter name', async () => {
  render(<MemoryRouter initialEntries={['/profile']}><ProfilePage /></MemoryRouter>);
  await userEvent.click(screen.getAllByRole('button', { name: /^Edit/ })[0]);
  const box = screen.getByLabelText('Display Name');
  expect(screen.getByText(`3/${DISPLAY_NAME_MAX_LENGTH}`)).toBeInTheDocument();
  await userEvent.clear(box);
  await userEvent.type(box, 'Q');
  await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
  expect(updateProfile).toHaveBeenCalledWith('u-1', expect.objectContaining({ displayName: 'Q' }));
});
