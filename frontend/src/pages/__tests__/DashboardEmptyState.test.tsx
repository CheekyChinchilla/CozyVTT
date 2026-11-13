/**
 * The dashboard of someone with no campaigns yet says what running one is,
 * naming the game master in full before the short form the rest of the app
 * uses.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/queries', () => ({
  useCampaignsQuery: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  useCharactersQuery: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  usePendingInvitationsQuery: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
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

it('names the game master in full where a newcomer first reads of the role', () => {
  render(<DashboardPage />);
  expect(screen.getByText(/As its game master \(GM\), you'll be able to invite players/)).toBeTruthy();
});
