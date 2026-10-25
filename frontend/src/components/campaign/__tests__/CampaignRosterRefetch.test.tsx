/**
 * The roster keeps its list while it refetches, and shows the newest answer.
 *
 * Every refetch (a member joining, a character brought in, an edit saved
 * from the roster) blanked the list to "Loading roster..." until the answer
 * came, which dropped a drag or hover in progress, and two refetches that
 * answered out of order left the older roster on screen.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { CampaignRole, type RosterMember } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const getCampaignCharacters = vi.fn();
const handlers: Record<string, (data?: unknown) => void> = {};
const socket = {
  on: (event: string, fn: (data?: unknown) => void) => { handlers[event] = fn; },
  off: vi.fn(),
  onPresenceState: vi.fn(),
  requestPresence: vi.fn(),
};

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

const member = (userId: string, userName: string, hp: number | null = null): RosterMember => ({
  userId, userName, userAvatar: null, role: userId === 'dm' ? CampaignRole.DM : CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z',
  characters: hp === null ? [] : [{ id: `${userId}-char`, name: `${userName}'s hero`, tokenImageUrl: null, gameSystem: null, userId, hp: { current: hp, max: 10, temp: 0 } }],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

beforeEach(() => {
  getCampaignCharacters.mockReset();
  useGameStore.getState().clearGameState();
});

it('keeps the list on screen while it refetches, and keeps the newest answer', async () => {
  getCampaignCharacters.mockResolvedValueOnce({ roster: [member('dm', 'Mara'), member('p1', 'Ash', 7)] });
  render(<CampaignRoster />);
  await screen.findByText('Ash');
  expect(useGameStore.getState().characterHp['p1-char']).toMatchObject({ current: 7 });

  const older = deferred<{ roster: RosterMember[] }>();
  const newer = deferred<{ roster: RosterMember[] }>();
  getCampaignCharacters.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  act(() => { handlers['roster.updated']?.(); });
  act(() => { handlers['roster.updated']?.(); });

  expect(screen.queryByText('Loading roster...')).toBeNull();
  expect(screen.getByText('Ash')).toBeTruthy();

  await act(async () => { newer.resolve({ roster: [member('dm', 'Mara'), member('p1', 'Ash', 7), member('p2', 'Bryn')] }); await newer.promise; });
  await waitFor(() => expect(screen.getByText('Bryn')).toBeTruthy());
  await act(async () => { older.resolve({ roster: [member('dm', 'Mara')] }); await older.promise; });

  expect(screen.getByText('Bryn')).toBeTruthy();
  expect(screen.getByText('Ash')).toBeTruthy();
});
