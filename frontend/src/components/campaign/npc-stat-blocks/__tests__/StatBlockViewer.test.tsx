/**
 * What a stat block shows in each system.
 *
 * - Fantasy d20: the creature's level, its attribute modifiers and Fort,
 *   Ref and Will. The viewer showed "Level" only from a challenge rating, so a
 *   Fantasy d20 creature never showed its level and a 5E creature borrowed
 *   into a Fantasy d20 campaign had its CR called a level; it showed 5e
 *   scores and modifiers worked out from them, ignoring the modifiers the
 *   editors write; and it cut the saves to "for", "ref" and "wil".
 * - Flexible and other systems: negative saves and skills printed "+-1", and
 *   keys printed as stored ("sleightOfHand").
 */

import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatBlockViewer from '../StatBlockViewer';
import { GameSystem } from '@/types';
import type { NpcStatBlock } from '@/types';

const base: NpcStatBlock = { ac: 18, hpMax: 45, speed: '25 feet', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };

it('shows a Fantasy d20 creature\'s level, its modifiers and Fort, Ref and Will', () => {
  const statBlock: NpcStatBlock = {
    ...base,
    level: 3,
    attributeModifiers: { str: 4, dex: 2, con: 3, int: -1, wis: 1, cha: 0 },
    savingThrows: { fortitude: 9, reflex: 7, will: 6 },
  };
  const { container } = render(<StatBlockViewer statBlock={statBlock} tokenName="Ogre Brute" gameSystem={GameSystem.FANTASY_D20} />);

  expect(container.textContent).toContain('Level 3');
  expect(container.textContent).toContain('Fort +9, Ref +7, Will +6');
  expect(container.textContent).not.toMatch(/\bfor\b|\bwil\b/);
  // Modifiers, and no score behind them.
  expect(screen.getByText('+4')).toBeTruthy();
  expect(screen.getByText('-1')).toBeTruthy();
  expect(screen.queryByText('10')).toBeNull();
});

it('calls a 5E challenge rating borrowed into a Fantasy d20 campaign a CR', () => {
  const { container } = render(<StatBlockViewer statBlock={{ ...base, challengeRating: '1/4' }} tokenName="Goblin" gameSystem={GameSystem.FANTASY_D20} />);
  expect(container.textContent).toContain('CR 1/4');
  expect(container.textContent).not.toContain('Level');
});

// A campaign stored with a system CozyVTT no longer supports shows its
// creatures as a campaign with no system does.
it('shows a creature in a campaign of a system it does not know as one with none', () => {
  const statBlock: NpcStatBlock = { ...base, challengeRating: '1' };
  const { container } = render(<StatBlockViewer statBlock={statBlock} tokenName="Pond Newt" gameSystem={'SOMETHING_ELSE' as GameSystem} />);
  const { container: none } = render(<StatBlockViewer statBlock={statBlock} tokenName="Pond Newt" gameSystem={null} />);
  expect(container.textContent).toContain('CR 1');
  expect(container.textContent).toBe(none.textContent);
});

it('prints negative saves and skills with a minus, and names them, in a Flexible campaign', () => {
  const statBlock: NpcStatBlock = { ...base, savingThrows: { dex: -1, wis: 3 }, skills: { sleightOfHand: 3, stealth: -2 } };
  const { container } = render(<StatBlockViewer statBlock={statBlock} tokenName="Thug" gameSystem={null} />);
  expect(container.textContent).toContain('Dex -1, Wis +3');
  expect(container.textContent).toContain('Sleight of Hand +3, Stealth -2');
  expect(container.textContent).not.toContain('+-');
});
