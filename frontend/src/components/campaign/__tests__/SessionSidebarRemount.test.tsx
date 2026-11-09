/**
 * The rail's open tab and the Chat tab's unread count are the game store's,
 * so a rail drawn again shows the tab that was open and the count so far.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MessageType } from '@/types';
import type { ChatMessageBroadcast } from '@/types';

const nothing = vi.hoisted(() => () => ({ default: () => null }));
const listeners = new Set<(data: ChatMessageBroadcast) => void>();
const socket = {
  onChatMessage: (fn: (data: ChatMessageBroadcast) => void) => { listeners.add(fn); },
  off: (_event: string, fn: (data: ChatMessageBroadcast) => void) => { listeners.delete(fn); },
};
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('../ChatPanel', nothing);
vi.mock('../DiceRoller', nothing);
vi.mock('../VibeTracker', nothing);
vi.mock('../InitiativeTracker', nothing);
vi.mock('../SessionControls', nothing);
vi.mock('../SessionHistory', nothing);
vi.mock('../PersonalNotes', nothing);

import SessionSidebar from '../SessionSidebar';
import { useGameStore } from '@/stores/gameStore';

const said = (id: string): ChatMessageBroadcast => ({
  id, userId: 'mara', userName: 'Mara', content: 'Hi', type: MessageType.PLAYER, timestamp: '2026-10-28T12:00:00.000Z',
});
const deliver = (message: ChatMessageBroadcast) => act(() => listeners.forEach((fn) => fn(message)));

beforeEach(() => {
  window.localStorage.clear();
  useGameStore.getState().clearGameState();
});

it('opens on the tab that was open, with the unread count so far', () => {
  const first = render(<SessionSidebar />);
  fireEvent.click(screen.getByRole('tab', { name: 'Initiative' }));
  deliver(said('m-1'));
  deliver(said('m-2'));
  first.unmount();
  expect(listeners.size).toBe(0);

  render(<SessionSidebar />);

  expect(screen.getByRole('tab', { name: 'Initiative' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByLabelText('2 unread messages')).toBeTruthy();
  expect(listeners.size).toBe(1);
});
