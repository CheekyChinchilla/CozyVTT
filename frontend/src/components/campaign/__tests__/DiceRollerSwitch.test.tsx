/**
 * The Dice panel's boxes across a change of arrangement.
 *
 * A tablet turned across 1,024 px, or a window widened past it, redraws the
 * Dice panel's form for the other arrangement. Its parts sat in a different
 * order in each and had no keys, so React matched them by position: the
 * focus left Character and Purpose, and from the compact layout to the
 * desktop the Character box was reused as the Secret Roll checkbox, which
 * kept the focus, so the next space typed made the roll secret. Each part now
 * keeps its element, and a box with the focus opens More options.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
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

let flip: (compact: boolean) => void = () => undefined;

function Switchable() {
  const [compact, setCompact] = useState(false);
  flip = setCompact;
  return <LayoutProvider compact={compact}><DiceRoller /></LayoutProvider>;
}

async function openPanel() {
  render(<Switchable />);
  await screen.findByRole('textbox', { name: 'Dice expression' });
}

const box = (name: string) => screen.getByRole('textbox', { name, hidden: true });
const turn = (compact: boolean) => act(() => flip(compact));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

describe('a box with the keyboard, as the arrangement changes', () => {
  for (const name of ['Character name', 'Purpose', 'Dice expression']) {
    it(`keeps ${name}, focused, typed into and in sight, from the desktop to the compact layout`, async () => {
      await openPanel();
      fireEvent.change(box(name), { target: { value: 'Brother Ansel' } });
      const typed = box(name);
      typed.focus();

      turn(true);

      expect(box(name)).toBe(typed);
      expect(document.activeElement).toBe(typed);
      expect(typed).toHaveValue('Brother Ansel');
      expect(typed.closest('[hidden]')).toBeNull();
    });

    it(`keeps ${name}, focused, from the compact layout to the desktop, and gives the focus to no other control`, async () => {
      await openPanel();
      turn(true);
      fireEvent.click(screen.getByRole('button', { name: /^More options/ }));
      const typed = box(name);
      typed.focus();

      turn(false);

      expect(box(name)).toBe(typed);
      expect(document.activeElement).toBe(typed);
      expect(document.activeElement).not.toBe(document.getElementById('secretRoll'));
    });
  }
});
