/**
 * The dice log stays at the newest roll when its box gets shorter.
 *
 * It followed the newest roll only when a roll arrived. When its box got
 * shorter, a browser window made shorter or on a phone the Dice sheet made
 * full height and half again, it kept its scroll position, and the newest
 * rolls went below the view: 300 px of them in a window going from 900 to
 * 600 px tall. A reader at the newest roll now stays there as the box
 * changes size; one who has scrolled up is left where they are.
 */

import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import type { DiceRolledEvent } from '@/types';

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
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: { onDiceRolled: vi.fn(), onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(), off: vi.fn(), isConnected: () => true },
    status: 'connected',
    reconnectCount: 0,
    joinedEpoch: 1,
  }),
}));
const roll = (n: number): DiceRolledEvent => ({
  id: `roll-${n}`,
  userId: 'someone-else',
  userName: 'Bram',
  characterName: null,
  expression: '1d20',
  result: 10,
  breakdown: { expression: '1d20', rolls: [{ type: 'dice', notation: '1d20', count: 1, sides: 20, results: [10], total: 10 }], total: 10, formula: '10' },
  purpose: `Attack ${n}`,
  timestamp: new Date(Date.UTC(2026, 9, 9, 12, 0, n)).toISOString(),
  secret: false,
});
vi.mock('@/services/dice.service', () => ({ getDiceRolls: vi.fn(async () => [roll(3), roll(2), roll(1)]) }));
vi.mock('@/services/api', () => {
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }) };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import DiceRoller from '../DiceRoller';

/** Every ResizeObserver the panel makes, with what it observes. */
const observers: Array<{ report: () => void; targets: Element[] }> = [];
const scrolls = vi.fn();

beforeEach(() => {
  observers.length = 0;
  scrolls.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: scrolls, configurable: true, writable: true });
  vi.stubGlobal('ResizeObserver', class {
    private readonly entry: { report: () => void; targets: Element[] };
    constructor(callback: ResizeObserverCallback) {
      this.entry = { report: () => callback([], this as unknown as ResizeObserver), targets: [] };
      observers.push(this.entry);
    }
    observe(target: Element) { this.entry.targets.push(target); }
    unobserve() {}
    disconnect() { this.entry.targets = []; }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The log, laid out: 2,000 px of rolls in a 400 px box. */
async function openLog() {
  render(<DiceRoller />);
  await screen.findByText('Attack 1');
  const log = screen.getByRole('log', { name: 'Dice rolls' });
  Object.defineProperty(log, 'scrollHeight', { value: 2_000, configurable: true });
  Object.defineProperty(log, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(log, 'scrollTop', { value: 1_600, configurable: true, writable: true });
  fireEvent.scroll(log);
  await waitFor(() => expect(scrolls).toHaveBeenCalled());
  scrolls.mockClear();
  return log;
}

/** The log's box changes size. */
const resize = (log: Element) => act(() => observers.filter((o) => o.targets.includes(log)).forEach((o) => o.report()));

it('keeps a reader at the newest roll there as the box gets shorter', async () => {
  const log = await openLog();

  resize(log);

  expect(scrolls).toHaveBeenCalledWith({ top: 2_000 });
});

it('leaves a reader who has scrolled up where they are', async () => {
  const log = await openLog();
  log.scrollTop = 200;
  fireEvent.scroll(log);

  resize(log);

  expect(scrolls).not.toHaveBeenCalled();
});
