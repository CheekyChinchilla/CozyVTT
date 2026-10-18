/**
 * The chat and dice boxes at the keyboard, and chat times that move on.
 *
 * - Enter while an input method is composing (Japanese, Chinese, Korean)
 *   confirms the candidate; it used to send the half-composed text.
 * - The boxes were disabled while a roll was on its way or the chat cooldown
 *   ran, which threw keyboard focus to the page, so each roll or message
 *   meant clicking back into the box. They are read-only instead.
 * - A message's "just now" never changed, because the row is drawn once; it
 *   now moves on each minute.
 * - A failed Load More left its banner up for good; it clears when a later
 *   one works, and can be dismissed.
 */

import { it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { ChatMessageAck, ChatMessageEvent, Message } from '@/types';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  } }),
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [], chatCooldownEnabled: true, chatCooldownSeconds: 5 } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
const sendChatMessage = vi.fn<(data: ChatMessageEvent) => Promise<ChatMessageAck>>();
const rollDice = vi.fn();
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: {
      onChatMessage: vi.fn(), onChatSystem: vi.fn(), off: vi.fn(), on: vi.fn(),
      onDiceRolled: vi.fn(), onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(),
      isConnected: () => true, sendChatMessage: (d: ChatMessageEvent) => sendChatMessage(d), rollDice: (...a: unknown[]) => rollDice(...a),
    },
    status: 'connected', joinedEpoch: 1, reconnectCount: 0,
  }),
}));
const getMessages = vi.fn();
vi.mock('@/services/message.service', () => ({ getMessages: (...a: unknown[]) => getMessages(...a) }));
vi.mock('@/services/dice.service', () => ({ getDiceRolls: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/api', () => {
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }) };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import ChatPanel from '../ChatPanel';
import ChatMessage from '../ChatMessage';
import DiceRoller from '../DiceRoller';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  sendChatMessage.mockReset();
  sendChatMessage.mockResolvedValue({ ok: true, id: 'm-1' });
  rollDice.mockReset();
  rollDice.mockReturnValue(new Promise(() => {}));
  getMessages.mockReset();
  getMessages.mockResolvedValue({ messages: [], pagination: { hasMore: true, nextCursor: 'c1' } });
});

afterEach(() => {
  vi.useRealTimers();
});

it('does not send the chat message on an Enter that confirms an input method candidate', async () => {
  render(<ChatPanel />);
  const box = await screen.findByRole('textbox', { name: 'Chat message' });
  fireEvent.change(box, { target: { value: 'にほんご' } });

  fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
  expect(sendChatMessage).not.toHaveBeenCalled();

  fireEvent.keyDown(box, { key: 'Enter' });
  expect(sendChatMessage).toHaveBeenCalledTimes(1);
});

it('keeps the chat box focusable through the cooldown', async () => {
  render(<ChatPanel />);
  const box = await screen.findByRole('textbox', { name: 'Chat message' });
  fireEvent.change(box, { target: { value: 'Hello' } });
  fireEvent.keyDown(box, { key: 'Enter' });

  expect(box.hasAttribute('disabled')).toBe(false);
  expect((box as HTMLTextAreaElement).readOnly).toBe(true);
});

it('keeps the dice boxes focusable while a roll is on its way, and ignores a composing Enter', async () => {
  render(<DiceRoller />);
  const box = screen.getByPlaceholderText(/2d6\+3/);
  fireEvent.change(box, { target: { value: '1d20' } });

  fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
  expect(rollDice).not.toHaveBeenCalled();

  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  for (const input of [box, screen.getByPlaceholderText('Character'), screen.getByPlaceholderText('Purpose')]) {
    expect(input.hasAttribute('disabled')).toBe(false);
    expect((input as HTMLInputElement).readOnly).toBe(true);
  }
});

it('moves a message\'s time on each minute', () => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date('2026-10-18T20:00:00Z'));
  const message = { id: 'm-1', campaignId: 'campaign-1', userId: 'them', user: { id: 'them', displayName: 'Them' }, type: 'PLAYER', content: 'Hello', metadata: null, createdAt: '2026-10-18T20:00:00Z' } as unknown as Message;
  render(<ChatMessage message={message} />);
  expect(screen.getByText('just now')).toBeTruthy();

  act(() => { vi.advanceTimersByTime(3 * 60_000); });

  expect(screen.queryByText('just now')).toBeNull();
  expect(screen.getByText(/3 min/)).toBeTruthy();
});

it('clears a failed Load More banner when the next one works, and lets it be dismissed', async () => {
  getMessages.mockResolvedValueOnce({ messages: [{ id: 'm-0', campaignId: 'campaign-1', userId: 'them', user: { id: 'them', displayName: 'Them' }, type: 'PLAYER', content: 'Older', metadata: null, createdAt: '2026-10-18T19:00:00Z' }], pagination: { hasMore: true, nextCursor: 'c1' } });
  render(<ChatPanel />);
  const loadMore = await screen.findByRole('button', { name: 'Load More' });

  getMessages.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(loadMore);
  expect(await screen.findByText('offline')).toBeTruthy();

  getMessages.mockResolvedValueOnce({ messages: [], pagination: { hasMore: true, nextCursor: 'c2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
  await waitFor(() => expect(screen.queryByText('offline')).toBeNull());

  getMessages.mockRejectedValueOnce(new Error('offline again'));
  fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
  expect(await screen.findByText('offline again')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText('offline again')).toBeNull();
});
