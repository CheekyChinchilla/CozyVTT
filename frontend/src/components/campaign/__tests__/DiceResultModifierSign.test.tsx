/**
 * A roll's modifier chip shows what the roll did with the modifier.
 *
 * The server stores a modifier as the number written, and the sign or
 * operator before it only in the formula: `1d20-1` is the groups 1d20 and 1,
 * with the formula "13 - 1". The chip under the formula read the number alone
 * and showed "+1" for a modifier that was subtracted, in every game system.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import DiceResult from '../DiceResult';
import type { DiceRolledEvent } from '@/types';

vi.mock('framer-motion', () => ({
  useReducedMotionConfig: () => false,
  motion: new Proxy({}, {
    get: () => ({ children, ...rest }: { children?: unknown }) =>
      createElement('div', rest, children as never),
  }),
}));

type Group = DiceRolledEvent['breakdown']['rolls'][number];

const d20 = (face: number): Group => ({ type: 'dice', notation: '1d20', count: 1, sides: 20, results: [face], kept: [face], total: face });
const modifier = (value: number): Group => ({ type: 'modifier', value });

function roll(expression: string, formula: string, total: number, rolls: Group[]): DiceRolledEvent {
  return {
    id: 'roll-1',
    userId: 'u1',
    userName: 'Mara Voss',
    characterName: null,
    expression,
    result: total,
    purpose: null,
    timestamp: '2026-01-01T12:00:00.000Z',
    secret: false,
    breakdown: { expression, formula, total, rolls },
  };
}

/** The text of each modifier chip under the formula, in order. */
function chips(event: DiceRolledEvent): string[] {
  const { container } = render(<DiceResult roll={event} isCurrentUser={false} />);
  return Array.from(container.querySelectorAll('[data-modifier]')).map((chip) => chip.textContent ?? '');
}

describe('a modifier chip in the roll window', () => {
  it('shows a subtracted modifier with a minus', () => {
    expect(chips(roll('1d20-1', '13 - 1', 12, [d20(13), modifier(1)]))).toEqual(['-1']);
  });

  it('shows an added modifier with a plus, as before', () => {
    expect(chips(roll('1d20+2', '13 + 2', 15, [d20(13), modifier(2)]))).toEqual(['+2']);
  });

  it('shows each modifier by its own operator', () => {
    expect(chips(roll('1d20+5-2', '13 + 5 - 2', 16, [d20(13), modifier(5), modifier(2)]))).toEqual(['+5', '-2']);
    expect(chips(roll('1d20*2', '13 * 2', 26, [d20(13), modifier(2)]))).toEqual(['×2']);
    expect(chips(roll('1d20/2', '13 / 2', 6, [d20(13), modifier(2)]))).toEqual(['÷2']);
  });

  it('shows the number signed as stored where the formula does not name the groups one for one', () => {
    expect(chips(roll('1d20-1', '', 12, [d20(13), modifier(-1)]))).toEqual(['-1']);
    expect(chips(roll('1d20+3', 'thirteen and three', 16, [d20(13), modifier(3)]))).toEqual(['+3']);
  });
});
