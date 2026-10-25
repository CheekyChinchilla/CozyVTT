/**
 * A saved roll says what it is in the dice log.
 *
 * A saved roll's button sent only its dice, with whatever the Purpose and
 * Character boxes held, usually nothing, so the table saw "1d20+5" and not
 * "Longsword". It now goes out with its name as the roll's purpose.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DiceRollAck, DiceRollEvent } from '@/types';

const campaignStatus = vi.hoisted(() => ({ value: 'ACTIVE' }));

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
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: campaignStatus.value, memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));

const handlers: Record<string, (data: never) => void> = {};
const rollDice = vi.fn<(roll: DiceRollEvent) => Promise<DiceRollAck>>();
const socket = {
  onDiceRolled: vi.fn(),
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
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [{ id: 'm1', userId: 'me', campaignId: 'campaign-1', name: 'Longsword', expression: '1d20+5', createdAt: '', updatedAt: '' }] }) };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import DiceRoller from '../DiceRoller';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  rollDice.mockReset().mockResolvedValue({ ok: true, id: 'r1' });
  campaignStatus.value = 'ACTIVE';
  for (const key of Object.keys(handlers)) delete handlers[key];
});

it('sends a saved roll with its name as the purpose', async () => {
  render(<DiceRoller />);
  fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }));

  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ expression: '1d20+5', purpose: 'Longsword' });
});

it('keeps the character typed in the Character box', async () => {
  render(<DiceRoller />);
  fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Aria' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }));

  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ characterName: 'Aria', purpose: 'Longsword' });
});

it('names a saved roll made while the session is paused, which stays on this screen', async () => {
  campaignStatus.value = 'PAUSED';
  render(<DiceRoller />);
  fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }));

  expect(rollDice).not.toHaveBeenCalled();
  expect(await screen.findByText(/Longsword/, { selector: ':not(button)' })).toBeTruthy();
});
