/**
 * Who is online at the table, kept in one place.
 *
 * The roster listened for `presence.state` itself and kept the set in its
 * own state, so nothing else could read it. The chat's To list puts the
 * members who are in session first, so the set moved into the game store,
 * written by one listener on the campaign page and read by both. A set for
 * another campaign is ignored, and the set is asked for once the campaign
 * is joined and again after each rejoin.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameStore } from '@/stores/gameStore';

type PresenceHandler = (data: { campaignId: string; onlineUserIds: string[] }) => void;
let onPresence: PresenceHandler | null = null;
const requestPresence = vi.fn();
const off = vi.fn();
const socket = {
  onPresenceState: (fn: PresenceHandler) => { onPresence = fn; },
  requestPresence: () => requestPresence(),
  off: (event: string, fn: PresenceHandler) => off(event, fn),
};
let joinedEpoch = 1;
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket, joinedEpoch }) }));

import { usePresenceSync } from '../usePresenceSync';

beforeEach(() => {
  onPresence = null;
  joinedEpoch = 1;
  requestPresence.mockReset();
  off.mockReset();
  useGameStore.getState().clearGameState();
});

it('puts the campaign\'s set in the store, whole, and ignores another campaign\'s', () => {
  renderHook(() => usePresenceSync('c1'));

  act(() => onPresence!({ campaignId: 'c1', onlineUserIds: ['ash', 'mara'] }));
  expect([...useGameStore.getState().onlineUserIds].sort()).toEqual(['ash', 'mara']);

  act(() => onPresence!({ campaignId: 'c2', onlineUserIds: ['someone else'] }));
  act(() => onPresence!({ campaignId: 'c1', onlineUserIds: ['mara'] }));
  expect([...useGameStore.getState().onlineUserIds]).toEqual(['mara']);
});

it('asks for the set once joined and again after a rejoin, and stops listening when it goes', () => {
  const { rerender, unmount } = renderHook(() => usePresenceSync('c1'));
  expect(requestPresence).toHaveBeenCalledTimes(1);

  joinedEpoch = 2;
  rerender();
  expect(requestPresence).toHaveBeenCalledTimes(2);

  const handler = onPresence;
  unmount();
  expect(off).toHaveBeenCalledWith('presence.state', handler);
});

it('is cleared with the rest of the table when the campaign changes', () => {
  renderHook(() => usePresenceSync('c1'));
  act(() => onPresence!({ campaignId: 'c1', onlineUserIds: ['ash'] }));

  act(() => useGameStore.getState().clearGameState());

  expect(useGameStore.getState().onlineUserIds.size).toBe(0);
});
