/**
 * The roster's "in session" dots read who is online from the game store.
 *
 * The roster kept its own copy of `presence.state`, with its own listener.
 * The set now lives in the game store, written by one listener on the
 * campaign page (usePresenceSync), so the chat's To list reads the same set;
 * the roster no longer listens for it.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CampaignRole, type RosterMember } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const getCampaignCharacters = vi.fn();
const socket = { on: vi.fn(), off: vi.fn() };

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'c1', memberships: [] }, currentMap: null, userRole: 'DM' }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm' } }) }));
vi.mock('@/services/api', () => {
  const client = { getCampaignCharacters: (...a: unknown[]) => getCampaignCharacters(...a) };
  return { api: client, default: client };
});

import CampaignRoster from '../CampaignRoster';

const member = (userId: string, userName: string): RosterMember => ({
  userId, userName, userAvatar: null, role: userId === 'dm' ? CampaignRole.DM : CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z', characters: [],
});

beforeEach(() => {
  getCampaignCharacters.mockReset();
  useGameStore.getState().clearGameState();
});

it('shows who is in session from the store, and follows it', async () => {
  getCampaignCharacters.mockResolvedValue({ roster: [member('dm', 'Dana'), member('p1', 'Ash'), member('p2', 'Mara')] });
  act(() => useGameStore.getState().setOnlineUserIds(['dm', 'p1']));
  render(<CampaignRoster />);

  expect(await screen.findByRole('img', { name: 'Ash is in session' })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Mara is not in session' })).toBeTruthy();

  act(() => useGameStore.getState().setOnlineUserIds(['dm', 'p2']));

  expect(screen.getByRole('img', { name: 'Ash is not in session' })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Mara is in session' })).toBeTruthy();
});
