/**
 * The roster says when it cannot load, or cannot open a character's sheet.
 *
 * A failed roster load wrote to the browser's console and showed "No members
 * yet", as if the campaign were empty, and a click on a character whose
 * sheet would not load did nothing at all. The roster now says it could not
 * be loaded, with Try again, and a sheet that will not open says why.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignRole, type RosterMember } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const getCampaignCharacters = vi.fn();
const getCharacter = vi.fn();
const handlers: Record<string, (data?: unknown) => void> = {};
const socket = {
  on: (event: string, fn: (data?: unknown) => void) => { handlers[event] = fn; },
  off: vi.fn(),
};

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'c1', memberships: [] }, currentMap: null, userRole: 'DM' }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm' } }) }));
vi.mock('@/services/api', () => {
  const client = { getCampaignCharacters: (...a: unknown[]) => getCampaignCharacters(...a), getCharacter: (...a: unknown[]) => getCharacter(...a) };
  return { api: client, default: client };
});

import CampaignRoster from '../CampaignRoster';

const member = (userId: string, userName: string, hp: number | null = null): RosterMember => ({
  userId, userName, userAvatar: null, role: userId === 'dm' ? CampaignRole.DM : CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z',
  characters: hp === null ? [] : [{ id: `${userId}-char`, name: `${userName}'s hero`, tokenImageUrl: null, gameSystem: null, userId, hp: { current: hp, max: 10, temp: 0 } }],
});

const refusal = (message: string) => ({ response: { status: 429, data: { message } } });

beforeEach(() => {
  getCampaignCharacters.mockReset();
  getCharacter.mockReset();
  useGameStore.getState().clearGameState();
});

it('says the roster could not be loaded, and loads it again on Try again', async () => {
  getCampaignCharacters.mockRejectedValueOnce(refusal('Too many requests, please slow down'));
  render(<CampaignRoster />);
  expect(await screen.findByText('The roster could not be loaded.')).toBeInTheDocument();
  expect(screen.queryByText('No members yet')).not.toBeInTheDocument();
  expect(screen.getByText('Too many requests, please slow down')).toBeInTheDocument();

  getCampaignCharacters.mockResolvedValueOnce({ roster: [member('dm', 'Mara'), member('p1', 'Ash', 7)] });
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Ash')).toBeInTheDocument();
});

it('says why a character sheet would not open', async () => {
  getCampaignCharacters.mockResolvedValueOnce({ roster: [member('dm', 'Mara'), member('p1', 'Ash', 7)] });
  getCharacter.mockRejectedValue(refusal('Character not found'));
  render(<CampaignRoster />);
  await userEvent.click(await screen.findByText("Ash's hero"));
  await waitFor(() => expect(screen.getByText('Character not found')).toBeInTheDocument());
});
