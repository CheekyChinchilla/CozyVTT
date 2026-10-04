/**
 * Chat and dice history are read again after the page has rejoined the
 * campaign, not when the transport comes back.
 *
 * The transport reconnects before `authenticate` puts the socket back in the
 * campaign's room. A history read made in that gap can miss a message or a
 * roll sent before the socket rejoined, and nothing later brings it back.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';

const ws = { reconnectCount: 0, joinedEpoch: 1 };

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  } }),
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }),
}));
const socket = {
  onDiceRolled: vi.fn(), onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(),
  onChatMessage: vi.fn(), onChatSystem: vi.fn(), on: vi.fn(), off: vi.fn(), emitDiceRoll: vi.fn(), emitChatMessage: vi.fn(),
};
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket, status: 'connected', reconnectCount: ws.reconnectCount, joinedEpoch: ws.joinedEpoch }),
}));
const getDiceRolls = vi.fn().mockResolvedValue([]);
vi.mock('@/services/dice.service', () => ({ getDiceRolls: (...a: unknown[]) => getDiceRolls(...a) }));
const getMessages = vi.fn().mockResolvedValue({ messages: [], pagination: { hasMore: false } });
vi.mock('@/services/message.service', () => ({ getMessages: (...a: unknown[]) => getMessages(...a) }));
vi.mock('@/services/api', () => {
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }) };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import DiceRoller from '../DiceRoller';
import ChatPanel from '../ChatPanel';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  ws.reconnectCount = 0;
  ws.joinedEpoch = 1;
  getDiceRolls.mockClear();
  getMessages.mockClear();
});

it.each([
  ['the dice history', () => <DiceRoller />, () => getDiceRolls],
  ['the chat history', () => <ChatPanel />, () => getMessages],
])('reads %s again only once the page has rejoined', async (_label, element, read) => {
  const view = render(element());
  await waitFor(() => expect(read()).toHaveBeenCalledTimes(1));

  // The transport is back; the socket has not rejoined the campaign yet.
  ws.reconnectCount = 1;
  await act(async () => { view.rerender(element()); });
  expect(read()).toHaveBeenCalledTimes(1);

  // Rejoined.
  ws.joinedEpoch = 2;
  await act(async () => { view.rerender(element()); });
  await waitFor(() => expect(read()).toHaveBeenCalledTimes(2));
});
