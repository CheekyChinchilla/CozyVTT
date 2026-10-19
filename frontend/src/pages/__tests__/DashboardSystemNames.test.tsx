/**
 * The dashboard names a character's game system in words.
 *
 * Its character list showed the stored code, "DND_5E", under each name.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CharacterSummary } from '@/types';
import { GAME_SYSTEM_LABELS } from '@/constants/game-systems';
import { GameSystem } from '@/types';

const characters = [
  { id: 'char-1', userId: 'me', name: 'Aldra', gameSystem: 'DND_5E', campaignId: null, tokenImageUrl: null, createdAt: '', updatedAt: '' },
  { id: 'char-2', userId: 'me', name: 'Bramble', gameSystem: null, campaignId: null, tokenImageUrl: null, createdAt: '', updatedAt: '' },
] as unknown as CharacterSummary[];

vi.mock('@/hooks/queries', () => ({
  useCampaignsQuery: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  useCharactersQuery: () => ({ data: characters, isPending: false, error: null, refetch: vi.fn() }),
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

it("names each character's game system, and Flexible for none", () => {
  render(<DashboardPage />);
  expect(screen.getByText(GAME_SYSTEM_LABELS[GameSystem.DND_5E])).toBeTruthy();
  expect(screen.getByText('Flexible')).toBeTruthy();
  expect(screen.queryByText('DND_5E')).toBeNull();
});
