/**
 * The Dice log gets the room for several rolls.
 *
 * In a sheet half a phone's height the log was about 110 px under the panel's
 * own header row, and one roll took about 150 px. Each roll is now two lines
 * (DiceResultDense.test.tsx), on the desktop too. On the compact layout the
 * header row's title goes, since the sheet's heading names the panel already,
 * and its Secret and Clear move behind More options, so the log starts at the
 * top of the sheet's body. The log takes the room the controls leave.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { DiceRolledEvent } from '@/types';
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
const seat = vi.hoisted(() => ({ role: 'GM' }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: seat.role, campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));

const socket = {
  onDiceRolled: vi.fn(),
  onDiceRolledSecret: vi.fn(),
  onDiceHistoryCleared: vi.fn(),
  off: vi.fn(),
  isConnected: () => true,
};
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket, status: 'connected', reconnectCount: 0, joinedEpoch: 1 }),
}));
const history = vi.hoisted(() => ({ rolls: [] as DiceRolledEvent[] }));
vi.mock('@/services/dice.service', () => ({ getDiceRolls: vi.fn(() => Promise.resolve(history.rolls)) }));
vi.mock('@/services/api', () => {
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }) };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import DiceRoller from '../DiceRoller';

const roll = (id: string, over: Partial<DiceRolledEvent> = {}): DiceRolledEvent => ({
  id,
  userId: 'p1',
  userName: 'Bram Holt',
  characterName: null,
  expression: '1d8+2',
  result: 10,
  purpose: 'Damage',
  timestamp: '2026-10-31T23:12:00Z',
  secret: false,
  breakdown: { expression: '1d8+2', formula: '8 + 2', total: 10, rolls: [{ type: 'dice', notation: '1d8', count: 1, sides: 8, results: [8], kept: [8], total: 8 }, { type: 'modifier', value: 2 }] },
  ...over,
});

function renderPanel(compact: boolean) {
  const Wrap = ({ children }: { children: ReactNode }) => <LayoutProvider compact={compact}>{children}</LayoutProvider>;
  return render(<DiceRoller />, { wrapper: Wrap });
}

/** The box around the roll log, and the block of controls under it. */
function logAndControls() {
  const log = screen.getByRole('log', { name: 'Dice rolls' });
  return { log, box: log.parentElement!, controls: log.parentElement!.nextElementSibling as HTMLElement };
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  seat.role = 'GM';
  history.rolls = [roll('r2', { secret: true, userId: 'p2', userName: 'Cass Wren', purpose: 'Stealth' }), roll('r1')];
});

it('draws each roll in the log as a two-line entry on the compact layout', async () => {
  renderPanel(true);
  const { log } = logAndControls();
  await within(log).findAllByText('Bram Holt');
  expect(log.textContent).toContain('1d8+2[8] + 2');
  expect(within(log).queryByText(/Formula/)).toBeNull();
  expect(log.textContent).toContain('Bram Holt');
  expect(log.textContent).toContain('· Damage');
});

it('leaves the panel its own title on the desktop, and to the sheet on the compact layout', async () => {
  renderPanel(true);
  await within(logAndControls().log).findAllByText('Bram Holt');
  expect(screen.queryByRole('heading', { name: 'Dice Roller' })).toBeNull();
  // The log is the panel's first part: nothing above it.
  expect(logAndControls().box.previousElementSibling).toBeNull();
});

it("keeps Secret and the GM's Clear on the compact layout behind More options, under the controls", async () => {
  renderPanel(true);
  const { controls } = logAndControls();
  fireEvent.click(within(controls).getByRole('button', { name: /^More options/ }));
  const secret = await within(controls).findByRole('button', { name: 'Secret' });
  const clear = within(controls).getByRole('button', { name: 'Clear' });
  expect(secret).toHaveAttribute('aria-pressed', 'true');
  for (const button of [secret, clear]) expect(button.className.split(/\s+/)).toContain('touch-target');
});

it('shows a player no row for them when there is nothing to show or clear', async () => {
  seat.role = 'PLAYER';
  history.rolls = [roll('r1', { userId: 'me' })];
  renderPanel(true);
  await within(logAndControls().log).findAllByText('Bram Holt');
  expect(screen.queryByRole('button', { name: 'Secret' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  expect(logAndControls().box.previousElementSibling).toBeNull();
});

it('gives the log the room the controls leave on the compact layout, with no floor that could outgrow the sheet', () => {
  renderPanel(true);
  expect(logAndControls().box.className.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']));
});

it('keeps the desktop panel its title, Secret and Clear above the log, and two-line rolls in it', async () => {
  renderPanel(false);
  const { log, box } = logAndControls();
  await within(log).findAllByText('Bram Holt');
  expect(within(log).queryByText(/Formula/)).toBeNull();
  const header = box.previousElementSibling as HTMLElement;
  expect(within(header).getByRole('heading', { name: 'Dice Roller' })).toBeTruthy();
  expect(within(header).getByRole('button', { name: 'Secret' })).toBeTruthy();
  expect(within(header).getByRole('button', { name: 'Clear' })).toBeTruthy();
  expect(box.className.split(' ')).toContain('min-h-0');
});
