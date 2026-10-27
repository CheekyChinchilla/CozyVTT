/**
 * Remove from Campaign on a roster character.
 *
 * Choosing it closed the right-click menu, and with the menu went the record
 * of which character it was for, so pressing Remove in the confirmation did
 * nothing: the character stayed in the campaign, with no message. The
 * confirmation now keeps the character it asks about.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignRole, type RosterMember } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const getCampaignCharacters = vi.fn();
const assignCharacterToCampaign = vi.fn();
const socket = { on: vi.fn(), off: vi.fn() };

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'c1', memberships: [{ userId: 'dm', role: 'DM' }] }, currentMap: null, userRole: 'DM' }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm' } }) }));
vi.mock('@/services/api', () => {
  const client = {
    getCampaignCharacters: (...a: unknown[]) => getCampaignCharacters(...a),
    assignCharacterToCampaign: (...a: unknown[]) => assignCharacterToCampaign(...a),
  };
  return { api: client, default: client };
});

import CampaignRoster from '../CampaignRoster';

const roster = (): RosterMember[] => [
  { userId: 'dm', userName: 'Mara', userAvatar: null, role: CampaignRole.DM, joinedAt: '2026-10-01T00:00:00.000Z', characters: [] },
  {
    userId: 'p1', userName: 'Ash', userAvatar: null, role: CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z',
    characters: [{ id: 'ash-hero', name: "Ash's hero", tokenImageUrl: null, gameSystem: null, userId: 'p1', hp: { current: 7, max: 10, temp: 0 } }],
  },
];

beforeEach(() => {
  getCampaignCharacters.mockReset().mockResolvedValue({ roster: roster() });
  assignCharacterToCampaign.mockReset().mockResolvedValue({});
  useGameStore.getState().clearGameState();
});

it('removes the character the menu was opened on once Remove is pressed', async () => {
  render(<CampaignRoster />);
  fireEvent.contextMenu(await screen.findByText("Ash's hero"), { clientX: 40, clientY: 40 });
  await userEvent.click(await screen.findByRole('button', { name: /Remove from Campaign/ }));

  await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

  await waitFor(() => expect(assignCharacterToCampaign).toHaveBeenCalledWith('ash-hero', null));
  expect(getCampaignCharacters).toHaveBeenCalledTimes(2);
});

it('removes nothing when the confirmation is cancelled', async () => {
  render(<CampaignRoster />);
  fireEvent.contextMenu(await screen.findByText("Ash's hero"), { clientX: 40, clientY: 40 });
  await userEvent.click(await screen.findByRole('button', { name: /Remove from Campaign/ }));

  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

  expect(assignCharacterToCampaign).not.toHaveBeenCalled();
});
