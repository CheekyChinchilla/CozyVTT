/**
 * The Chat tab's unread count includes whispers to you.
 *
 * The count is of every `chat.message` from someone else that arrives while
 * the tab is hidden. The server sends a whisper only to its two people, so a
 * whisper to you is counted like any other message and one between others
 * never arrives. This pins that: the count needed no change for whispers.
 */

import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MessageType } from '@/types';
import type { ChatMessageBroadcast } from '@/types';

const nothing = vi.hoisted(() => () => ({ default: () => null }));
let onMessage: ((data: ChatMessageBroadcast) => void) | null = null;
const socket = {
  onChatMessage: (fn: (data: ChatMessageBroadcast) => void) => { onMessage = fn; },
  off: vi.fn(),
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

const whisper = (id: string, from: string, to: string): ChatMessageBroadcast => ({
  id, userId: from, userName: from, content: 'Psst', type: MessageType.WHISPER, recipientId: to, recipientName: to, timestamp: '2026-10-27T12:00:00.000Z',
});

it('counts a whisper to you while the Chat tab is hidden, and not one you sent', () => {
  render(<SessionSidebar />);
  fireEvent.click(screen.getByRole('tab', { name: 'Dice' }));

  act(() => onMessage!(whisper('w-1', 'mara', 'me')));
  act(() => onMessage!(whisper('w-2', 'me', 'mara')));

  expect(screen.getByLabelText('1 unread messages')).toBeTruthy();

  fireEvent.click(screen.getByRole('tab', { name: /^Chat/ }));
  expect(screen.queryByLabelText(/unread messages/)).toBeNull();
});
