/**
 * The dashboard's invitations name the campaign's DM.
 *
 * Each card said "DM:" and the campaign's owner, who no longer runs the game
 * once it has been handed over. It now names the member who is the DM.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignStatus, InvitationStatus, type CampaignInvitation } from '@/types';

const invitation: CampaignInvitation = {
  id: 'inv-1', campaignId: 'camp-1', userId: 'me', status: InvitationStatus.PENDING,
  createdAt: '2026-10-18T00:00:00.000Z', expiresAt: null,
  campaign: {
    id: 'camp-1', name: 'Handed over', description: null, gameSystem: null, status: CampaignStatus.ACTIVE,
    owner: { displayName: 'Olwen the Owner' }, dm: { displayName: 'Dara the DM' },
  },
};

vi.mock('@/hooks/queries', () => ({
  useCampaignsQuery: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  useCharactersQuery: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  usePendingInvitationsQuery: () => ({ data: [invitation], isPending: false, error: null, refetch: vi.fn() }),
  queryKeys: { campaigns: ['campaigns'], characters: ['characters'], pendingInvitations: ['invitations'] },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me', platformRole: 'USER' }, logout: vi.fn() }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ mascotUrl: '' }) }));
vi.mock('@/components/LeftCampaignNotes', () => ({ default: () => null }));
vi.mock('@/components/campaign/CampaignImportDialog', () => ({ default: () => null }));
vi.mock('@/components/CreateCampaignModal', () => ({ default: () => null }));

import DashboardPage from '../DashboardPage';

it('names the member who runs the campaign as its DM', () => {
  render(<DashboardPage />);
  expect(screen.getByText(/DM: Dara the DM/)).toBeTruthy();
  expect(screen.queryByText(/Olwen the Owner/)).toBeNull();
});
