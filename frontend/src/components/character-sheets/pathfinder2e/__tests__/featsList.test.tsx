/**
 * The Pathfinder 2e sheet lists feats by level without changing the
 * character it was given.
 *
 * It sorted each category in place, reordering the list the page and its
 * cache hold (a frozen list threw), compared a feat with no level as NaN, so
 * its place was left to chance, and showed it as "Level undefined".
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatsList } from '../components/FeatsList';

const empty = { ancestryAndHeritage: [], class: [], skill: [], general: [], bonus: [] };

describe('the feats list', () => {
  it('sorts a copy, leaving the character\'s own list as it was', () => {
    const classFeats = Object.freeze([
      Object.freeze({ name: 'Sudden Charge', level: 2 }),
      Object.freeze({ name: 'Power Attack', level: 1 }),
    ]);
    render(<FeatsList feats={{ ...empty, class: classFeats as never }} />);

    const names = screen.getAllByText(/Sudden Charge|Power Attack/).map((el) => el.textContent);
    expect(names).toEqual(['Power Attack', 'Sudden Charge']);
    expect(classFeats.map((f) => f.name)).toEqual(['Sudden Charge', 'Power Attack']);
  });

  it('puts a feat with no level first, and shows no level for it', () => {
    render(<FeatsList feats={{ ...empty, class: [{ name: 'Sudden Charge', level: 2 }, { name: 'Shield Block' }] as never }} />);

    expect(screen.getAllByText(/Sudden Charge|Shield Block/).map((el) => el.textContent)).toEqual(['Shield Block', 'Sudden Charge']);
    expect(screen.queryByText('Level undefined')).toBeNull();
  });
});
