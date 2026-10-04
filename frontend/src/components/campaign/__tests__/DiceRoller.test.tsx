/**
 * A spectator sees the dice panel but cannot roll from it.
 *
 * The server refuses a spectator's `dice.roll`; the panel says so before
 * they try and sends nothing. The rule is tested on the server, and the
 * DiceRoller call site was not, so a panel that quietly emitted the roll and
 * let the server refuse it would have passed every test.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const emitDiceRoll = vi.fn();

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  } }),
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'SPECTATOR', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'watcher', displayName: 'Watcher' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: {
      onDiceRolled: vi.fn(), onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(),
      on: vi.fn(), off: vi.fn(), emitDiceRoll,
    },
    status: 'connected',
    reconnectCount: 0,
    joinedEpoch: 1,
  }),
}));
vi.mock('@/services/dice.service', () => ({ getDiceRolls: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/api', () => {
  const client = { listDiceMacros: vi.fn().mockResolvedValue({ macros: [] }), createDiceMacro: vi.fn(), updateDiceMacro: vi.fn(), deleteDiceMacro: vi.fn() };
  return { api: client, default: client };
});
vi.mock('../DiceMacroManager', () => ({ default: () => null }));

import DiceRoller from '../DiceRoller';

// jsdom has no scrollTo; the panel scrolls its history into view on render.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

describe('DiceRoller for a spectator', () => {
  it('says the dice are not theirs, and sends nothing when they try', async () => {
    render(<DiceRoller />);
    expect(await screen.findByText(/You are watching this campaign/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/2d6\+3/), { target: { value: '1d20' } });
    fireEvent.click(screen.getByRole('button', { name: /^Roll$/ }));

    expect(emitDiceRoll).not.toHaveBeenCalled();
    expect(await screen.findByText(/Spectators watch the dice/)).toBeTruthy();
  });
});
