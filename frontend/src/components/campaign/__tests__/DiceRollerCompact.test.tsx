/**
 * The Dice panel's controls on the compact layout leave the roll log room.
 *
 * Below the log sits a block of about 300 pixels: three wrapping rows of
 * quick rolls, the expression, Character and Purpose, Secret Roll, Roll and a
 * hint. In a sheet half a phone's height it took nearly all of the panel and
 * left the log nothing. On the compact layout the quick rolls, the saved rolls
 * and **Saved** sit in one row that scrolls sideways, Roll sits beside the
 * expression, Character and Purpose wait behind **More options**, and the log
 * keeps at least 40 percent of the panel's height, the controls scrolling
 * when they need more. On the desktop nothing changes.
 *
 * jsdom lays nothing out, so the 40 percent is read from the classes that
 * set it; a browser shows the result.
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

const QUICK_ROLL_NAMES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'Adv', 'Dis', '4d6kh3', 'Longsword', 'Manage saved rolls'];

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

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  rollDice.mockReset().mockResolvedValue({ ok: true, id: 'r1' });
});

it('puts every quick roll in one row that scrolls sideways', async () => {
  renderCompact();
  const row = screen.getByRole('group', { name: 'Quick Roll' });
  await within(row).findByRole('button', { name: 'Longsword' });
  for (const name of QUICK_ROLL_NAMES) {
    const button = within(row).getByRole('button', { name });
    expect(button.className).toContain('shrink-0');
  }
  expect(row.className).toContain('flex-nowrap');
  expect(row.className).toContain('overflow-x-auto');
  expect(screen.queryByText('Quick Roll:')).toBeNull();
});

it('keeps Character and Purpose behind More options', async () => {
  renderCompact();
  const toggle = screen.getByRole('button', { name: 'More options' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('textbox', { name: 'Character name' })).toBeNull();
  expect(screen.queryByRole('textbox', { name: 'Purpose' })).toBeNull();

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Purpose' }), { target: { value: 'Stealth' } });

  // Closed again, it names what the next roll still carries.
  fireEvent.click(toggle);
  expect(screen.queryByRole('textbox', { name: 'Purpose' })).toBeNull();
  expect(screen.getByRole('button', { name: 'More options: Purpose' })).toBe(toggle);

  fireEvent.click(toggle);
  fireEvent.change(screen.getByRole('textbox', { name: 'Character name' }), { target: { value: 'Vex' } });
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'More options: Character, Purpose' })).toBe(toggle);

  fireEvent.click(await screen.findByRole('button', { name: 'd20' }));
  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ expression: '1d20', characterName: 'Vex', purpose: 'Stealth' });
});

it('rolls from the expression beside its Roll button, and keeps Secret Roll in sight', async () => {
  renderCompact();
  expect(screen.getByRole('checkbox', { name: /Secret Roll/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: /Secret Roll/ }));
  const expression = screen.getByRole('textbox', { name: 'Dice expression' });
  const roll = screen.getByRole('button', { name: 'Roll' });
  expect(roll.parentElement).toBe(expression.parentElement);
  fireEvent.change(expression, { target: { value: '2d6+3' } });
  fireEvent.click(roll);
  await waitFor(() => expect(rollDice).toHaveBeenCalledTimes(1));
  expect(rollDice.mock.calls[0][0]).toMatchObject({ expression: '2d6+3', secret: true });
});

it('keeps at least 40 percent of the panel for the log, the controls scrolling when they need more', () => {
  renderCompact();
  const { box, controls } = logAndControls();
  expect(box.className.split(' ')).toContain('min-h-[40%]');
  expect(box.className.split(' ')).not.toContain('min-h-0');
  expect(controls.className.split(' ')).toEqual(expect.arrayContaining(['min-h-0', 'overflow-y-auto']));
  expect(controls.className.split(' ')).not.toContain('shrink-0');
  expect(screen.queryByText('Press Enter to roll')).toBeNull();
});

/** The controls under the log, each as a finger presses it: a checkbox by its label. */
async function footerControls() {
  await screen.findByRole('button', { name: 'Longsword' });
  const { controls } = logAndControls();
  const presses = within(controls).getAllByRole('button').filter((b) => !b.closest('[hidden]'));
  const boxes = within(controls).getAllByRole('checkbox').map((box) => box.closest('label') ?? box);
  return [...presses, ...within(controls).getAllByRole('textbox'), ...boxes];
}

it('gives every control under the log a 44 pixel target on a touch screen', async () => {
  renderCompact();
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  const controls = await footerControls();
  expect(controls.length).toBe(19);
  for (const control of controls) expect(control.className.split(/\s+/), control.textContent ?? '').toContain('touch-target');
  // The log keeps its floor beside them.
  expect(logAndControls().box.className.split(' ')).toContain('min-h-[40%]');
});

it('leaves the desktop panel as it was', async () => {
  render(<DiceRoller />);
  await screen.findByRole('button', { name: 'Longsword' });
  expect(screen.getByText('Quick Roll:')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Quick Roll' })).toBeNull();
  expect(screen.queryByRole('button', { name: /More options/ })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Character name' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Purpose' })).toBeTruthy();
  expect(screen.getByText('Press Enter to roll')).toBeTruthy();
  const { box, controls } = logAndControls();
  expect(box.className.split(' ')).toContain('min-h-0');
  expect(controls.className.split(' ')).toContain('shrink-0');
  for (const control of await footerControls()) expect(control.className).not.toContain('touch-target');
});
