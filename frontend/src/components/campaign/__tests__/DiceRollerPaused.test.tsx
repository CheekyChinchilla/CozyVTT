/**
 * A paused table rolls by the same rules as the server.
 *
 * While a session is paused a player's rolls are worked out in the browser,
 * by a reader of its own that knew only dice, keep and plus or minus, and
 * read anything else as a number: `4d6dl1` came out as 4, `1d20*2` as the
 * number 1, and `1d20+5*2` as 1d20+5, each shown as an ordinary result. The
 * browser now has the server's parser, the same file byte for byte, so
 * these come out as they would at a running table, and what the server
 * refuses is refused here with the same reason.
 */

import { it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('framer-motion', () => ({
  useReducedMotionConfig: () => false,
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  } }),
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'PAUSED', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
const rollDice = vi.fn();
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: { onDiceRolled: vi.fn(), onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(), on: vi.fn(), off: vi.fn(), isConnected: () => true, rollDice },
    status: 'connected', reconnectCount: 0, joinedEpoch: 1,
  }),
}));
vi.mock('@/services/dice.service', () => ({ getDiceRolls: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/api', () => {
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }) };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import DiceRoller from '../DiceRoller';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

function roll(expression: string) {
  fireEvent.change(screen.getByPlaceholderText(/2d6\+3/), { target: { value: expression } });
  fireEvent.click(screen.getByRole('button', { name: /^Roll$/ }));
}

/** The total shown beside a rolled expression. */
const totalOf = (expression: string) =>
  screen.getByText(expression, { selector: 'span' }).closest('div.gap-3')?.textContent?.split('=').pop()?.trim();

it.each([
  ['4d1dl1', '3'],
  ['1d1*2', '2'],
  ['1d1+5*2', '11'],
  ['7/2', '3'],
])('rolls %s to %s, without the server', (expression, total) => {
  render(<DiceRoller />);
  roll(expression);
  expect(totalOf(expression)).toBe(total);
  expect(rollDice).not.toHaveBeenCalled();
});

it('refuses what the server refuses, with its reason', () => {
  render(<DiceRoller />);
  roll('1d20 5');
  expect(screen.getByText('Invalid dice expression: Missing an operator between "1d20" and "5"')).toBeTruthy();
});
