/**
 * The dice log follows new rolls to the bottom while the reader is there.
 *
 * It keeps the latest 50 rolls, and it scrolled when the number of rolls
 * changed, so once a session passed 50 rolls the count stayed at 50 and a new
 * roll never brought the list down to it. A reader who has scrolled up to look
 * at older rolls is left where they are, unless the new roll is their own, as
 * the chat panel does for a message they send.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import type { DiceRolledEvent } from '@/types';

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
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }),
}));

const live = vi.hoisted(() => ({ deliver: null as ((roll: DiceRolledEvent) => void) | null }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: {
      onDiceRolled: (handler: (roll: DiceRolledEvent) => void) => { live.deliver = handler; },
      onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(),
      on: vi.fn(), off: vi.fn(), emitDiceRoll: vi.fn(),
    },
    status: 'connected',
    reconnectCount: 0,
    joinedEpoch: 1,
  }),
}));

const history = vi.hoisted(() => ({ rolls: [] as unknown[] }));
vi.mock('@/services/dice.service', () => ({ getDiceRolls: vi.fn(async () => history.rolls) }));
vi.mock('@/services/api', () => {
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }), createDiceMacro: vi.fn(), updateDiceMacro: vi.fn(), deleteDiceMacro: vi.fn() };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import DiceRoller from '../DiceRoller';

function roll(n: number, userId = 'someone-else'): DiceRolledEvent {
  return {
    id: `roll-${n}`,
    userId,
    userName: userId,
    characterName: null,
    expression: '1d20',
    result: 10,
    breakdown: { expression: '1d20', rolls: [{ type: 'dice', notation: '1d20', count: 1, sides: 20, results: [10], total: 10 }], total: 10, formula: '1d20' },
    purpose: `Attack ${n}`,
    timestamp: new Date(Date.UTC(2026, 9, 9, 12, 0, n)).toISOString(),
    secret: false,
  };
}

/** Rolls 1 to `count`, newest first, as the server's history answers. */
const historyOf = (count: number) => Array.from({ length: count }, (_, i) => roll(count - i));

const scrolls = vi.fn();
beforeEach(() => {
  scrolls.mockClear();
  live.deliver = null;
  // jsdom has no scrollTo and no layout.
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: scrolls, configurable: true });
});

/** The scrolling roll list, found from one of its rolls. */
const rollList = () => screen.getByText('Attack 1').closest('.overflow-y-auto') as HTMLElement;

/**
 * Give the list a layout: `height` pixels of rolls in a 400-pixel window,
 * scrolled to `top`, with the scroll event the browser would send.
 */
function layOut(list: HTMLElement, height: number, top: number) {
  Object.defineProperty(list, 'scrollHeight', { value: height, configurable: true });
  Object.defineProperty(list, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(list, 'scrollTop', { value: top, configurable: true, writable: true });
  fireEvent.scroll(list);
}

/** The reader is at the bottom of the list, then scrolls `fromBottom` pixels up. */
function scrollUp(list: HTMLElement, fromBottom: number) {
  layOut(list, 2000, 1600);
  layOut(list, 2000, 1600 - fromBottom);
}

async function showHistory(count: number) {
  history.rolls = historyOf(count);
  render(<DiceRoller />);
  await screen.findByText('Attack 1');
  await waitFor(() => expect(live.deliver).not.toBeNull());
  scrolls.mockClear();
}

describe('the dice log following new rolls', () => {
  it('follows a new roll when it already holds 50', async () => {
    await showHistory(50);
    act(() => live.deliver!(roll(51)));
    await screen.findByText('Attack 51');
    await waitFor(() => expect(scrolls).toHaveBeenCalled());
  });

  it('follows a new roll while it holds fewer than 50', async () => {
    await showHistory(3);
    act(() => live.deliver!(roll(4)));
    await screen.findByText('Attack 4');
    await waitFor(() => expect(scrolls).toHaveBeenCalled());
  });

  it('leaves a reader who has scrolled up where they are', async () => {
    await showHistory(50);
    scrollUp(rollList(), 600);
    act(() => live.deliver!(roll(51)));
    await screen.findByText('Attack 51');
    // Give an effect the chance to run before saying it did not scroll.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(scrolls).not.toHaveBeenCalled();
  });

  it('follows a roll that lands while it is still scrolling down to the last', async () => {
    await showHistory(50);
    const list = rollList();
    layOut(list, 2000, 1600);
    act(() => live.deliver!(roll(51)));
    await waitFor(() => expect(scrolls).toHaveBeenCalledTimes(1));
    // The new roll makes the list 80 pixels taller, and the smooth scroll is
    // part-way down to it: moving down, 60 pixels short of the bottom.
    layOut(list, 2080, 1620);
    act(() => live.deliver!(roll(52)));
    await screen.findByText('Attack 52');
    await waitFor(() => expect(scrolls).toHaveBeenCalledTimes(2));
  });

  it('brings a reader who has scrolled up down to a roll of their own', async () => {
    await showHistory(50);
    scrollUp(rollList(), 600);
    act(() => live.deliver!(roll(51, 'me')));
    await screen.findByText('Attack 51');
    await waitFor(() => expect(scrolls).toHaveBeenCalled());
  });
});
