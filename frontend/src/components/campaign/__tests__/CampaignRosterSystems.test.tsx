/**
 * The roster's label for a character's game system is the one the rest of the
 * app shows: GAME_SYSTEM_SHORT_LABELS. The roster kept a third copy of the
 * labels, which named one system differently from every other place.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignRole, GameSystem, type RosterMember } from '@/types';
import { GAME_SYSTEM_SHORT_LABELS } from '@/constants/game-systems';
import { useGameStore } from '@/stores/gameStore';

const getCampaignCharacters = vi.fn();
const socket = { on: vi.fn(), off: vi.fn() };

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'c1', memberships: [] }, currentMap: null, viewedMap: null, userRole: 'GM' }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm' } }) }));
vi.mock('@/services/api', () => {
  const client = { getCampaignCharacters: (...a: unknown[]) => getCampaignCharacters(...a) };
  return { api: client, default: client };
});

import CampaignRoster from '../CampaignRoster';

const systems = Object.values(GameSystem);

beforeEach(() => {
  getCampaignCharacters.mockReset();
  useGameStore.getState().clearGameState();
});

it('labels each character with its system\'s short name, as everywhere else', async () => {
  getCampaignCharacters.mockResolvedValue({
    roster: [{
      userId: 'p1', userName: 'Ash', userAvatar: null, role: CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z',
      characters: systems.map((gameSystem, i) => ({ id: `c${i}`, name: `Hero ${i}`, tokenImageUrl: null, gameSystem, userId: 'p1', hp: null })),
    } satisfies RosterMember],
  });
  render(<CampaignRoster />);

  await screen.findByText('Hero 0');
  for (const system of systems) expect(screen.getByText(GAME_SYSTEM_SHORT_LABELS[system])).toBeTruthy();
});
