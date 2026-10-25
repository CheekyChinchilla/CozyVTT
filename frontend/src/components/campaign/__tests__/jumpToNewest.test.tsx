/**
 * Jump to newest, in the chat and the dice log.
 *
 * Neither log scrolls to something new while the reader is scrolled up, which
 * is right, but nothing said that something had arrived below. Now a
 * **Jump to newest** button appears until the reader is back at the bottom.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { ChatMessageBroadcast, DiceRolledEvent } from '@/types';

vi.mock('framer-motion', () => ({
  useReducedMotionConfig: () => false,
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  } }),
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
let onChat: ((data: ChatMessageBroadcast) => void) | null = null;
let onRolled: ((data: DiceRolledEvent) => void) | null = null;
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: {
      onChatMessage: (fn: (d: ChatMessageBroadcast) => void) => { onChat = fn; }, onChatSystem: vi.fn(), off: vi.fn(), on: vi.fn(),
      onDiceRolled: (fn: (d: DiceRolledEvent) => void) => { onRolled = fn; }, onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(),
      isConnected: () => true, sendChatMessage: vi.fn(), rollDice: vi.fn(),
    },
    status: 'connected', joinedEpoch: 1, reconnectCount: 0,
  }),
}));
vi.mock('@/services/message.service', () => ({ getMessages: vi.fn().mockResolvedValue({ messages: [], pagination: { hasMore: false, nextCursor: null } }) }));
vi.mock('@/services/dice.service', () => ({ getDiceRolls: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/api', () => {
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }) };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import ChatPanel from '../ChatPanel';
import DiceRoller from '../DiceRoller';

const scrollTo = vi.fn();
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: scrollTo, configurable: true });
});
beforeEach(() => {
  scrollTo.mockClear();
  onChat = null;
  onRolled = null;
});

/** Put a scrolling list 600px above its bottom, as a reader scrolling up does. */
function scrollUp(list: HTMLElement) {
  Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(list, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(list, 'scrollTop', { value: 1000, writable: true, configurable: true });
  fireEvent.scroll(list);
  list.scrollTop = 900;
  fireEvent.scroll(list);
}

const jump = () => screen.queryByRole('button', { name: 'Jump to newest' });

it('offers Jump to newest in the chat when a message arrives below the reader', async () => {
  render(<ChatPanel />);
  const list = await screen.findByRole('log', { name: 'Chat messages' });
  scrollUp(list);

  act(() => onChat!({ id: 'm-1', userId: 'them', userName: 'Them', content: 'Below you', type: 'PLAYER' as ChatMessageBroadcast['type'], timestamp: new Date().toISOString() }));
  expect(jump()).not.toBeNull();

  fireEvent.click(jump()!);
  expect(jump()).toBeNull();
  expect(scrollTo).toHaveBeenCalled();
});

it('offers Jump to newest in the dice log when a roll arrives below the reader', async () => {
  const { container } = render(<DiceRoller />);
  await waitFor(() => expect(onRolled).not.toBeNull());
  const roll = (id: string): DiceRolledEvent => ({
    id, userId: 'them', userName: 'Them', characterName: null, expression: '1d6', result: 4,
    breakdown: { expression: '1d6', rolls: [], total: 4, formula: '4' }, purpose: null, timestamp: new Date().toISOString(), secret: false,
  });
  act(() => onRolled!(roll('r-1')));
  const list = container.querySelector('.overflow-y-auto') as HTMLElement;
  scrollUp(list);

  act(() => onRolled!(roll('r-2')));
  expect(jump()).not.toBeNull();

  fireEvent.click(jump()!);
  expect(jump()).toBeNull();
});
