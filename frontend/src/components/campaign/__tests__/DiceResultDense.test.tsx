/**
 * A roll in the compact layout's Dice log takes two lines.
 *
 * A roll card took about 150 px: who and what for, the expression with its
 * total, a formula line and a row of dice. The log in a sheet half a phone's
 * height is about 110 px, so it showed part of one roll. On the compact
 * layout a roll is two lines: who rolled, what for and when; then the
 * expression, its working (the dice as plain text) and the total beside both.
 * It keeps what a player reads: a critical or a fumble, a secret roll, the
 * die kept and the one dropped, the purpose that says damage, and everything
 * a screen reader said of the full card.
 */

import { it, expect, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { createElement } from 'react';
import DiceResult from '../DiceResult';
import type { DiceRolledEvent } from '@/types';

vi.mock('framer-motion', () => ({
  useReducedMotionConfig: () => false,
  motion: new Proxy({}, {
    get: () => ({ children, ...rest }: { children?: unknown }) => {
      const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition)$/.test(k)));
      return createElement('div', plain, children as never);
    },
  }),
}));

const NOW = new Date('2026-10-31T23:20:00Z');

const roll = (over: Partial<DiceRolledEvent> = {}): DiceRolledEvent => ({
  id: 'r1',
  userId: 'u1',
  userName: 'Aria Fenwick',
  characterName: "Aria's Sellsword",
  expression: '1d20+5',
  result: 18,
  purpose: 'Longsword attack',
  timestamp: '2026-10-31T23:12:00Z',
  secret: false,
  breakdown: {
    expression: '1d20+5',
    formula: '13 + 5',
    total: 18,
    rolls: [
      { type: 'dice', notation: '1d20', count: 1, sides: 20, results: [13], kept: [13], total: 13 },
      { type: 'modifier', value: 5 },
    ],
  },
  ...over,
});

const advantage = (faces: [number, number], kept: number): DiceRolledEvent => roll({
  characterName: null,
  expression: '2d20kh1',
  result: kept,
  purpose: 'Perception (Advantage)',
  breakdown: {
    expression: '2d20kh1',
    formula: String(kept),
    total: kept,
    rolls: [{ type: 'dice', notation: '2d20kh1', count: 2, sides: 20, results: faces, kept: [kept], total: kept }],
  },
});

/** Drawn at NOW, so the time reads the same in every run. */
function at<T>(draw: () => T): T {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    return draw();
  } finally {
    vi.useRealTimers();
  }
}

function renderDense(r: DiceRolledEvent, isCurrentUser = true, rollerIsGM = false) {
  const view = at(() => render(<DiceResult roll={r} isCurrentUser={isCurrentUser} rollerIsGM={rollerIsGM} dense />));
  return view.container.firstElementChild as HTMLElement;
}

/** The entry's two lines, and the total beside them. */
function parts(entry: HTMLElement) {
  const [text, total] = [...entry.children] as HTMLElement[];
  const [first, second] = [...text.children] as HTMLElement[];
  return { text, first, second, total };
}

it('writes a roll on two lines, the total beside them', () => {
  const entry = renderDense(roll());
  const { text, first, second, total } = parts(entry);
  expect(entry.children).toHaveLength(2);
  expect(text.children).toHaveLength(2);
  expect(first).toHaveTextContent("Aria's Sellsword (you rolled)· Longsword attack8m ago");
  expect(second).toHaveTextContent('1d20+5[13] + 5');
  expect(total).toHaveTextContent('= 18');
  expect(total.className.split(' ')).toEqual(expect.arrayContaining(['text-xl', 'font-bold']));
  // No third line: the formula and the dice are the working.
  expect(within(entry).queryByText(/Formula/)).toBeNull();
});

it('strikes through the die advantage dropped, and says so to a screen reader', () => {
  const entry = renderDense(advantage([9, 14], 14));
  const { first, second } = parts(entry);
  expect(first).toHaveTextContent('Perception (Advantage)');
  expect(second).toHaveTextContent('2d20kh1[9 dropped 14]');
  const dropped = within(second).getByText('9');
  expect(dropped.className).toContain('line-through');
  expect(within(second).getByText('14').className).not.toContain('line-through');
});

it('colours a critical and a fumble, and names them', () => {
  const crit = renderDense(advantage([9, 20], 20));
  expect(parts(crit).total.className).toContain('text-success-ink');
  expect(crit.className).toContain('bg-success/10');
  expect(parts(crit).second).toHaveTextContent('Critical success!');
  expect(within(parts(crit).second).getByText('20').className).toContain('text-success-ink');

  const fumble = renderDense(roll({ result: 6, breakdown: { expression: '1d20+5', formula: '1 + 5', total: 6, rolls: [{ type: 'dice', notation: '1d20', count: 1, sides: 20, results: [1], kept: [1], total: 1 }, { type: 'modifier', value: 5 }] } }));
  expect(parts(fumble).total.className).toContain('text-danger-ink');
  expect(fumble.className).toContain('bg-danger/10');
  expect(parts(fumble).second).toHaveTextContent('Critical fail!');
});

it('marks a secret roll as secret, yours or one the GM is shown', () => {
  const mine = renderDense(roll({ secret: true, characterName: null, purpose: 'Stealth' }));
  const badge = within(parts(mine).first).getByText(/Secret/);
  expect(badge).toHaveTextContent('🔒 Secret');
  expect(badge).toHaveAttribute('title', 'Hidden from the other players — your GM can still see it');

  const theirs = renderDense(roll({ secret: true }), false, false);
  expect(within(parts(theirs).first).getByText(/Secret/)).toHaveTextContent('🔒 Secret (GM view)');
});

// On a narrow line the name and the Secret mark were cut through while the
// purpose kept its width (seen at 1280 by 720): the purpose now gives way first.
it('shortens the purpose before the name, and never the Secret mark or the time', () => {
  const entry = renderDense(roll({ secret: true, purpose: 'Longsword attack against the goblin chief' }));
  const { first } = parts(entry);
  const name = within(first).getByText("Aria's Sellsword").parentElement as HTMLElement;
  const purpose = within(first).getByText(/Longsword attack against/) as HTMLElement;
  const badge = within(first).getByText(/Secret/);
  const time = within(first).getByText('8m ago');
  const shrinkOf = (el: HTMLElement) => {
    const found = el.className.split(' ').find((c) => c === 'shrink' || c.startsWith('shrink-'));
    if (found === 'shrink') return 1;
    if (found === 'shrink-0') return 0;
    return Number(found?.match(/shrink-\[(\d+)\]/)?.[1] ?? 1);
  };
  expect(purpose.className).toContain('truncate');
  expect(purpose.className).not.toContain('max-w-');
  expect(shrinkOf(purpose)).toBeGreaterThan(0);
  // The name gives way only past two thirds of the line, never to make room for the purpose.
  expect(shrinkOf(name)).toBe(0);
  expect(name.className).toContain('max-w-[65%]');
  expect(shrinkOf(badge)).toBe(0);
  expect(shrinkOf(time)).toBe(0);
});

it('keeps the purpose that says a roll is damage, and the working of every group', () => {
  const entry = renderDense(roll({
    expression: '1d8+1d6-2',
    result: 7,
    purpose: 'Longsword damage',
    breakdown: {
      expression: '1d8+1d6-2',
      formula: '5 + 4 - 2',
      total: 7,
      rolls: [
        { type: 'dice', notation: '1d8', count: 1, sides: 8, results: [5], kept: [5], total: 5 },
        { type: 'dice', notation: '1d6', count: 1, sides: 6, results: [4], kept: [4], total: 4 },
        { type: 'modifier', value: 2 },
      ],
    },
  }));
  expect(parts(entry).first).toHaveTextContent('Longsword damage');
  expect(parts(entry).second).toHaveTextContent('1d8+1d6-2[5] + [4] - 2');
});

it('says as much to a screen reader as the full card does', () => {
  const r = advantage([20, 9], 20);
  const full = at(() => render(<DiceResult roll={r} isCurrentUser={false} rollerIsGM />)).container;
  const dense = renderDense(r, false, true);
  // Word by word, each text node apart: elements side by side join their text.
  const words = (el: Element) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(...((node.textContent ?? '').toLowerCase().match(/[a-z0-9()+]+/g) ?? []));
    return out;
  };
  // The full card's words, less its label for the formula.
  const needed = new Set(words(full).filter((w) => w !== 'formula'));
  expect(needed).toEqual(new Set(['aria', 'fenwick', 'perception', '(advantage)', '8m', 'ago', '2d20kh1', '20', '9', 'critical', 'success']));
  const said = new Set(words(dense));
  for (const word of needed) expect(said, word).toContain(word);
});

it('still shows the expression and the total of a roll stored without its dice', () => {
  const entry = renderDense(roll({ breakdown: {} as DiceRolledEvent['breakdown'] }));
  expect(parts(entry).second).toHaveTextContent('1d20+5');
  expect(parts(entry).total).toHaveTextContent('18');
});
