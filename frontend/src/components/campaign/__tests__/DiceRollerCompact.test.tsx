/**
 * The Dice panel's controls leave the roll log room, on the compact layout
 * and on the desktop.
 *
 * A roll's card said its numbers three times and the controls took most of
 * the panel: an iPhone 13 mini's half-height sheet showed one roll and a
 * 1280 by 720 screen less than one. Now the seven dice sit in one row, d20
 * first, each a share of the width; Roll and More options sit beside the
 * expression; and the rest waits behind More options: on the compact layout
 * Adv, Dis, the saved rolls, Saved, Character, Purpose, Secret Roll, clearing
 * the fields, the secret-rolls eye and the DM's Clear; on the desktop
 * Character and Purpose, the other chips and Secret Roll staying in sight.
 * The log takes the room the controls leave, the panel's one scroll area.
 *
 * jsdom lays nothing out, so the layout is read from the classes that set
 * it; a browser shows the result.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { DiceRollAck, DiceRollEvent } from '@/types';
import { LayoutProvider } from '@/contexts/LayoutContext';

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
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));

const rollDice = vi.fn<(roll: DiceRollEvent) => Promise<DiceRollAck>>();
const socket = {
  onDiceRolled: vi.fn(),
  onDiceRolledSecret: vi.fn(),
  onDiceHistoryCleared: vi.fn(),
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

const DICE = ['d20', 'd4', 'd6', 'd8', 'd10', 'd12', 'd100'];

function renderCompact() {
  const Compact = ({ children }: { children: ReactNode }) => <LayoutProvider compact>{children}</LayoutProvider>;
  return render(<DiceRoller />, { wrapper: Compact });
}

/** The box around the roll log, and the block of controls under it. */
function logAndControls() {
  const log = screen.getByRole('log', { name: 'Dice rolls' });
  const box = log.parentElement!;
  return { box, controls: box.nextElementSibling as HTMLElement };
}

/** Whether a control is out of sight: in a closed part of the panel. */
const tucked = (el: HTMLElement) => el.closest('[hidden]') !== null;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  rollDice.mockReset().mockResolvedValue({ ok: true, id: 'r1' });
});

it.each([['compact', renderCompact], ['desktop', () => render(<DiceRoller />)]])(
  'puts the seven dice in one row, d20 first, each a share of the width (%s)',
  async (_name, show) => {
    show();
    const row = screen.getByRole('group', { name: 'Dice' });
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(DICE);
    expect(row.className.split(' ')).toEqual(expect.arrayContaining(['grid', 'grid-cols-7']));
    expect(screen.queryByText('Quick Roll:')).toBeNull();
    expect(screen.queryByText('Press Enter to roll')).toBeNull();
  },
);

it('keeps everything but the dice, the expression and Roll behind More options on the compact layout', async () => {
  renderCompact();
  const toggle = screen.getByRole('button', { name: 'More options' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  const longsword = await screen.findByRole('button', { name: 'Longsword', hidden: true });
  for (const el of [longsword, screen.getByRole('button', { name: 'Adv', hidden: true }), screen.getByRole('checkbox', { name: /Secret Roll/, hidden: true })]) {
    expect(tucked(el)).toBe(true);
  }
  expect(screen.queryByRole('textbox', { name: 'Character name' })).toBeNull();

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(tucked(longsword)).toBe(false);
  fireEvent.change(screen.getByRole('textbox', { name: 'Purpose' }), { target: { value: 'Stealth' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Secret Roll/ }));

  // Closed again, it names what the next roll still carries.
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'More options: Purpose, Secret' })).toBe(toggle);

  fireEvent.click(screen.getByRole('button', { name: 'd20' }));
  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ expression: '1d20', purpose: 'Stealth', secret: true });
});

it('rolls from the expression beside its Roll and More options buttons', async () => {
  renderCompact();
  const expression = screen.getByRole('textbox', { name: 'Dice expression' });
  const roll = screen.getByRole('button', { name: 'Roll' });
  expect(roll.parentElement).toBe(expression.parentElement);
  expect(screen.getByRole('button', { name: 'More options' }).parentElement).toBe(expression.parentElement);
  fireEvent.change(expression, { target: { value: '2d6+3' } });
  fireEvent.click(roll);
  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ expression: '2d6+3' });
});

it('gives the log the room the controls leave, the controls keeping their height', () => {
  renderCompact();
  const { box, controls } = logAndControls();
  expect(box.className.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']));
  expect(controls.className.split(' ')).toEqual(expect.arrayContaining(['shrink-0', 'max-h-[80%]']));
});

/** The controls under the log a finger can reach now, each as it is pressed: a checkbox by its label. */
async function footerControls() {
  await screen.findByRole('button', { name: 'Longsword', hidden: true });
  const { controls } = logAndControls();
  const shown = (el: HTMLElement) => !tucked(el);
  const presses = within(controls).queryAllByRole('button').filter(shown);
  const boxes = within(controls).queryAllByRole('checkbox').filter(shown).map((box) => box.closest('label') ?? box);
  return [...presses, ...within(controls).queryAllByRole('textbox').filter(shown), ...boxes];
}

it('gives every control under the log a 44 pixel target on a touch screen, More options open or shut', async () => {
  renderCompact();
  const shut = await footerControls();
  expect(shut).toHaveLength(10);
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  const open = await footerControls();
  expect(open.length).toBeGreaterThan(shut.length);
  for (const control of open) expect(control.className.split(/\s+/), control.textContent ?? '').toContain('touch-target');
});

it('keeps the chips and Secret Roll in sight on the desktop, Character and Purpose behind More options', async () => {
  render(<DiceRoller />);
  await screen.findByRole('button', { name: 'Longsword' });
  expect(screen.getByRole('button', { name: 'Adv' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: /Secret Roll/ })).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: 'Character name' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  expect(screen.getByRole('textbox', { name: 'Character name' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Purpose' })).toBeTruthy();
  const { box, controls } = logAndControls();
  expect(box.className.split(' ')).toContain('min-h-0');
  expect(controls.className.split(' ')).toContain('shrink-0');
  for (const control of await footerControls()) expect(control.className).not.toContain('touch-target');
});
