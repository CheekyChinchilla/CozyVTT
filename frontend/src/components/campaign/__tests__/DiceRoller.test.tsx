/**
 * A spectator sees the dice panel but cannot roll from it.
 *
 * The server refuses a spectator's `dice.roll`; the panel says so before
 * they try and sends nothing. The rule is tested on the server, and the
 * DiceRoller call site was not, so a panel that quietly emitted the roll and
 * let the server refuse it would have passed every test.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import type { DiceRolledEvent } from '@/types';
import { PRESET_THEMES, deriveReadableTokens, type ThemeColors } from '@/themes';
import { contrastRatioChannels, AA_TEXT } from '@/utils/color';

const rollDice = vi.fn().mockResolvedValue({ ok: true, id: 'r' });
const seat = vi.hoisted(() => ({
  role: 'SPECTATOR',
  onRolled: null as ((data: never) => void) | null,
}));

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
  useCampaign: () => ({ userRole: seat.role, campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'watcher', displayName: 'Watcher' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: {
      onDiceRolled: (fn: (data: never) => void) => { seat.onRolled = fn; }, onDiceRolledSecret: vi.fn(), onDiceHistoryCleared: vi.fn(),
      on: vi.fn(), off: vi.fn(), rollDice,
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

    expect(rollDice).not.toHaveBeenCalled();
    expect(await screen.findByText(/Spectators watch the dice/)).toBeTruthy();
  });
});

describe('DiceRoller labels', () => {
  // The server refuses a roll whose name or purpose is longer than it stores,
  // so the boxes stop there instead of letting a roll be typed that will fail.
  it('stop the character name at 200 characters and the purpose at 300', () => {
    render(<DiceRoller />);
    expect((screen.getByPlaceholderText('Character') as HTMLInputElement).maxLength).toBe(200);
    expect((screen.getByPlaceholderText('Purpose') as HTMLInputElement).maxLength).toBe(300);
  });
});

describe('DiceRoller for a screen reader', () => {
  afterEach(() => { seat.role = 'SPECTATOR'; });

  // The history arrives as up to 50 rolls at once; a live region in place
  // before then read every one of them out.
  it('reads the roll list as a log that announces new rolls once the history is in', async () => {
    render(<DiceRoller />);
    const log = screen.getByRole('log', { name: 'Dice rolls' });
    expect(log.getAttribute('aria-live')).toBe('off');
    await waitFor(() => expect(log.getAttribute('aria-live')).toBe('polite'));
  });

  it('names the three roll boxes', () => {
    render(<DiceRoller />);
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('textbox', { name: 'Dice expression' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Character name' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Purpose' })).toBeTruthy();
  });

  // It showed only an icon, with the name in a tooltip.
  it('names the button that clears the roll boxes as its tooltip does', () => {
    render(<DiceRoller />);
    expect(screen.getByTitle('Clear all fields')).toHaveAttribute('aria-label', 'Clear all fields');
  });

  it('shows my own secret roll in a dialog named Secret Roll', async () => {
    seat.role = 'PLAYER';
    render(<DiceRoller />);
    await waitFor(() => expect(seat.onRolled).not.toBeNull());
    const secret: DiceRolledEvent = {
      id: 'r-9', userId: 'watcher', userName: 'Watcher', characterName: null, expression: '1d20', result: 17,
      breakdown: { expression: '1d20', rolls: [{ type: 'dice', notation: '1d20', count: 1, sides: 20, results: [17], total: 17 }], total: 17, formula: '17 = 17' },
      purpose: 'Sneaking', timestamp: new Date().toISOString(), secret: true,
    };

    act(() => seat.onRolled!(secret as never));

    const dialog = screen.getByRole('dialog', { name: 'Secret Roll' });
    expect(within(dialog).getByText('Sneaking')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Close$/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// A quick die is a tint of its colour, deeper under the pointer, with the
// theme's ink on it. Its hover was 80% of the colour, and 40% on a computer
// set to dark whatever the app's theme: ink fell to about 3.5:1 on a light
// theme and 2:1 on a dark one.
describe("DiceRoller's quick dice in every theme", () => {
  /** The tint `bg-<token>/<percent>` a button takes under `prefix`. */
  const tint = (button: HTMLElement, prefix: '' | 'hover:') => {
    const found = button.className.split(/\s+/).map((c) => new RegExp(`^${prefix}bg-([\\w-]+)/(\\d+)$`).exec(c)).find(Boolean);
    return found ? { token: found[1], alpha: Number(found[2]) / 100 } : null;
  };
  const over = (fill: string, background: string, alpha: number) => {
    const f = fill.split(/\s+/).map(Number);
    const b = background.split(/\s+/).map(Number);
    return f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha))).join(' ');
  };

  it('keep the ink readable on each die at rest and under the pointer', () => {
    render(<DiceRoller />);
    const dice = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map((name) => screen.getByRole('button', { name }));
    const low: string[] = [];
    for (const theme of PRESET_THEMES) {
      const derived = deriveReadableTokens(theme.colors);
      const channels = (token: string) => derived[`--rgb-${token}`] ?? theme.colors[token as keyof ThemeColors];
      for (const die of dice) {
        const rest = tint(die, '');
        const hover = tint(die, 'hover:');
        expect(rest && hover, die.textContent ?? '').toBeTruthy();
        expect(hover!.token).toBe(rest!.token);
        expect(hover!.alpha).toBeGreaterThan(rest!.alpha);
        for (const { alpha } of [rest!, hover!]) {
          for (const bg of [theme.colors.bgBase, theme.colors.bgSurface, theme.colors.paper]) {
            const ratio = contrastRatioChannels(theme.colors.ink, over(channels(rest!.token), bg, alpha));
            if (ratio < AA_TEXT) low.push(`${theme.name} ${die.textContent} at ${alpha * 100}%: ${ratio.toFixed(2)}:1`);
          }
        }
      }
    }
    expect([...new Set(low)]).toEqual([]);
  });
});
