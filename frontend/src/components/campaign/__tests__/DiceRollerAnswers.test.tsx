/**
 * The Dice panel hears the answer to its own rolls, and nothing else.
 *
 * It listened to every `error` on the socket and took each as a refused
 * roll: a chat message refused by the cooldown, a token move refused, a ping
 * refused, all showed in the Dice banner and ended a roll still on its way.
 * Each roll is now answered on its own, and the reason a roll was refused
 * shows here. A roll that arrives twice is listed once.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { DiceRollAck, DiceRollEvent, DiceRolledEvent } from '@/types';

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

const handlers: Record<string, (data: never) => void> = {};
let onRolled: ((data: DiceRolledEvent) => void) | null = null;
const rollDice = vi.fn<(roll: DiceRollEvent) => Promise<DiceRollAck>>();
const socket = {
  onDiceRolled: (fn: (data: DiceRolledEvent) => void) => { onRolled = fn; },
  onDiceRolledSecret: vi.fn(),
  onDiceHistoryCleared: vi.fn(),
  on: (event: string, fn: (data: never) => void) => { handlers[event] = fn; },
  off: vi.fn(),
  isConnected: () => true,
  rollDice: (roll: DiceRollEvent) => rollDice(roll),
};
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket, status: 'connected', reconnectCount: 0, joinedEpoch: 1 }),
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

beforeEach(() => {
  rollDice.mockReset();
  onRolled = null;
  for (const key of Object.keys(handlers)) delete handlers[key];
});

function roll(expression: string) {
  fireEvent.change(screen.getByPlaceholderText(/2d6\+3/), { target: { value: expression } });
  fireEvent.click(screen.getByRole('button', { name: /^Roll$/ }));
}

it('shows why its own roll was refused, and lets the next one go', async () => {
  rollDice.mockResolvedValueOnce({ ok: false, error: 'Invalid dice expression: Unexpected end' });
  render(<DiceRoller />);

  roll('1d20');

  expect(await screen.findByText('Invalid dice expression: Unexpected end')).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Roll$/ }).hasAttribute('disabled')).toBe(false);
});

it('does not take another panel\'s refusal as its own', async () => {
  render(<DiceRoller />);
  await waitFor(() => expect(onRolled).not.toBeNull());

  act(() => handlers.error?.({ message: 'Rate limit: wait 30s between messages.' } as never));

  expect(screen.queryByText('Rate limit: wait 30s between messages.')).toBeNull();
});

it('lists a roll that arrives twice once', async () => {
  render(<DiceRoller />);
  await waitFor(() => expect(onRolled).not.toBeNull());
  const rolled: DiceRolledEvent = {
    id: 'r-7', userId: 'them', userName: 'Them', characterName: null, expression: '1d6', result: 4,
    breakdown: { expression: '1d6', rolls: [{ type: 'dice', notation: '1d6', count: 1, sides: 6, results: [4], total: 4 }], total: 4, formula: '4 = 4' },
    purpose: 'Twice told', timestamp: new Date().toISOString(), secret: false,
  };

  act(() => onRolled!(rolled));
  act(() => onRolled!(rolled));

  expect(screen.getAllByText('Twice told')).toHaveLength(1);
});
