/**
 * A dice history the DM cleared while this page was away is cleared here too.
 *
 * The clear reaches only the pages online at the time. A page that rejoined
 * afterwards merged the server's list into what it held, which only adds, so
 * it kept every cleared roll until it was reloaded. On a rejoin the server's
 * list is now the history, with any roll that arrived while it was being
 * read, and rolls made in this browser during a pause.
 */

import { it, expect, vi, beforeAll } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { DiceRolledEvent } from '@/types';

const ws = { joinedEpoch: 1 };
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  } }),
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: { onDiceRolled: vi.fn(), onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(), on: vi.fn(), off: vi.fn(), isConnected: () => true, rollDice: vi.fn() },
    status: 'connected', reconnectCount: 0, joinedEpoch: ws.joinedEpoch,
  }),
}));
const getDiceRolls = vi.fn();
vi.mock('@/services/dice.service', () => ({ getDiceRolls: (...a: unknown[]) => getDiceRolls(...a) }));
vi.mock('@/services/api', () => {
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }) };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import DiceRoller from '../DiceRoller';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

const roll = (id: string, purpose: string): DiceRolledEvent => ({
  id, userId: 'them', userName: 'Them', characterName: null, expression: '1d6', result: 3,
  breakdown: { expression: '1d6', rolls: [], total: 3, formula: '3' }, purpose, timestamp: '2026-10-18T19:00:00.000Z', secret: false,
});

it('drops rolls the DM cleared while the page was away', async () => {
  getDiceRolls.mockResolvedValueOnce([roll('r-1', 'Before the clear')]);
  const view = render(<DiceRoller />);
  expect(await screen.findByText('Before the clear')).toBeTruthy();

  getDiceRolls.mockResolvedValueOnce([roll('r-2', 'After the clear')]);
  ws.joinedEpoch = 2;
  await act(async () => { view.rerender(<DiceRoller />); });

  await waitFor(() => expect(screen.getByText('After the clear')).toBeTruthy());
  expect(screen.queryByText('Before the clear')).toBeNull();
});
