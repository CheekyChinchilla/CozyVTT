/**
 * A saved roll says what it is in the dice log.
 *
 * A saved roll's button sent only its dice, with whatever the Purpose and
 * Character boxes held, usually nothing, so the table saw "1d20+5" and not
 * "Longsword". It now goes out with its name as the roll's purpose, or with a
 * purpose of its own when it has one.
 *
 * A saved roll can also keep a character, for a GM who saves a creature's
 * attack: it is rolled as that character while the Character box is empty,
 * and the box wins when it has something in it.
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
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [
    { id: 'm1', userId: 'me', campaignId: 'campaign-1', name: 'Longsword', expression: '1d20+5', characterName: null, purpose: null, createdAt: '', updatedAt: '' },
    { id: 'm2', userId: 'me', campaignId: 'campaign-1', name: 'Goblin', expression: '1d20+4', characterName: 'Hobgoblin', purpose: 'Longsword attack', createdAt: '', updatedAt: '' },
  ] }) };
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

it('rolls a saved roll as its own character, for its own purpose, while the Character box is empty', async () => {
  render(<DiceRoller />);
  fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: 'Ignored' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Goblin' }));

  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ expression: '1d20+4', characterName: 'Hobgoblin', purpose: 'Longsword attack' });
});

it('rolls a saved roll as the character in the Character box when it has one', async () => {
  render(<DiceRoller />);
  fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Grik' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Goblin' }));

  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ characterName: 'Grik', purpose: 'Longsword attack' });
});

it('takes a Character box of only spaces as empty', async () => {
  render(<DiceRoller />);
  fireEvent.change(screen.getByLabelText('Character name'), { target: { value: '   ' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Goblin' }));

  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ characterName: 'Hobgoblin' });
});

it('sends no character for a saved roll without one while the box is empty', async () => {
  render(<DiceRoller />);
  fireEvent.click(await screen.findByRole('button', { name: 'Longsword' }));

  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0].characterName).toBeUndefined();
});

it('leaves a typed roll to the boxes, whatever the saved rolls hold', async () => {
  render(<DiceRoller />);
  await screen.findByRole('button', { name: 'Goblin' });
  fireEvent.change(screen.getByLabelText('Dice expression'), { target: { value: '2d6' } });
  fireEvent.click(screen.getByRole('button', { name: /^Roll$/ }));

  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ expression: '2d6', characterName: undefined, purpose: undefined });
});

it('rolls a saved roll made while the session is paused as its own character, for its own purpose', async () => {
  campaignStatus.value = 'PAUSED';
  render(<DiceRoller />);
  fireEvent.click(await screen.findByRole('button', { name: 'Goblin' }));

  expect(rollDice).not.toHaveBeenCalled();
  expect(await screen.findByText(/Hobgoblin/)).toBeTruthy();
  expect(screen.getByText(/Longsword attack/)).toBeTruthy();
});
