/**
 * A roll shows its critical and which dice it dropped, whatever the notation.
 *
 * The critical was looked for only on a group written `1d20`, so advantage
 * (`2d20kh1`), disadvantage (`2d20kl1`) and a bare `d20`, the most common d20
 * rolls, never showed one. Dropped dice were found by value, so with equal
 * values nothing was struck, as in [14, 14] keeping one, or [5, 5, 5, 5]
 * keeping three.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import DiceResult from '../DiceResult';
import type { DiceRolledEvent, DiceRollDetail } from '@/types';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => ({ children, ...rest }: { children?: unknown }) => createElement('div', rest, children as never),
  }),
}));

const rolled = (expression: string, group: DiceRollDetail, total: number): DiceRolledEvent => ({
  id: 'r', userId: 'u1', userName: 'Mara', characterName: null, expression, result: total, purpose: null,
  timestamp: '2026-10-18T12:00:00.000Z', secret: false,
  breakdown: { expression, formula: String(total), total, rolls: [group] },
});

it.each([
  ['2d20kh1', [20, 7], [20], 'CRITICAL SUCCESS'],
  ['2d20kl1', [1, 15], [1], 'CRITICAL'],
  ['d20', [20], undefined, 'CRITICAL SUCCESS'],
])('shows the critical on %s', (notation, results, kept, banner) => {
  render(<DiceResult isCurrentUser={false} roll={rolled(notation, { type: 'dice', notation, count: results.length, sides: 20, results, kept, total: (kept ?? results)[0] }, (kept ?? results)[0])} />);
  expect(screen.getByText(new RegExp(banner))).toBeTruthy();
});

it('shows no critical when the 20 was the die dropped', () => {
  render(<DiceResult isCurrentUser={false} roll={rolled('2d20kl1', { type: 'dice', notation: '2d20kl1', count: 2, sides: 20, results: [20, 7], kept: [7], total: 7 }, 7)} />);
  expect(screen.queryByText(/CRITICAL/)).toBeNull();
});

it.each([
  ['2d20kh1', [14, 14], [14], 1],
  ['4d6kh3', [5, 5, 5, 5], [5, 5, 5], 1],
  ['4d6dl1', [3, 3, 6, 2], [3, 3, 6], 1],
])('strikes the dice %s dropped, equal values included', (notation, results, kept, dropped) => {
  const { container } = render(<DiceResult isCurrentUser={false} roll={rolled(notation, { type: 'dice', notation, count: results.length, sides: notation.includes('d20') ? 20 : 6, results, kept, total: kept.reduce((a, b) => a + b, 0) }, 0)} />);
  expect(container.querySelectorAll('.line-through')).toHaveLength(dropped);
});
