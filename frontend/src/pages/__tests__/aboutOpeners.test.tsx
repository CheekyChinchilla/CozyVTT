/**
 * About CozyVTT opens from the dashboard, the profile page and the sign-in
 * page, so its credits can be reached signed in or not.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'sam@example.test', displayName: 'Sam', platformRole: 'USER', mfaEnabled: false, avatarUrl: null },
    authenticated: false,
    mfaPending: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    changePassword: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries', () => ({
  useCampaignsQuery: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  useCharactersQuery: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  usePendingInvitationsQuery: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  useServerConfigQuery: () => ({ data: undefined }),
  queryKeys: { campaigns: ['campaigns'], characters: ['characters'], pendingInvitations: ['invitations'] },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ mascotUrl: '', appearance: null, applyUserPreferences: vi.fn() }) }));
vi.mock('@/components/LeftCampaignNotes', () => ({ default: () => null }));
vi.mock('@/components/campaign/CampaignImportDialog', () => ({ default: () => null }));
vi.mock('@/components/CreateCampaignModal', () => ({ default: () => null }));
vi.mock('@/components/profile/MFASection', () => ({ default: () => null }));
vi.mock('@/services/api', () => {
  const client = {
    getRegistrationStatus: vi.fn(async () => ({ allowRegistration: false })),
    getUserPreferences: vi.fn(async () => ({})),
    updateUserPreferences: vi.fn(),
  };
  return { api: client, default: client };
});

import DashboardPage from '../DashboardPage';
import ProfilePage from '../ProfilePage';
import LoginPage from '../auth/LoginPage';

const pages: Array<[string, ComponentType]> = [
  ['the dashboard', DashboardPage],
  ['the profile page', ProfilePage],
  ['the sign-in page', LoginPage],
];

describe('About CozyVTT', () => {
  it.each(pages)('opens from %s', async (_name, Page) => {
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: 'About CozyVTT' }));

    expect(await screen.findByRole('dialog', { name: 'About CozyVTT' })).toBeInTheDocument();
  });
});
