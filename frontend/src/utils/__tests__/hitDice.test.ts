/**
 * Spending a D&D 5e hit die.
 *
 * Checked against the Basic Rules: "For each Hit Die spent in this way, the
 * player rolls the die and adds the character's Constitution modifier to it.
 * The character regains hit points equal to the total (minimum of 0)." So a
 * spend is *one* die, not the whole pool — `total` holds "5d8", five d8 hit
 * dice, and rolling that string would roll all five at once.
 *
 * `total` is `z.string()` in the schema with no format constraint, so anything
 * can be in there. A sheet already shipped a crash on an empty one, so every
 * case below is a value the database can really hold.
 */

import { describe, it, expect } from 'vitest';
import { hitDieSize, spendRoll, canSpendHitDie, hitDieExpression, hitDiceMaximum } from '../hitDice';

describe('hitDieSize', () => {
  it('reads the die out of a pool', () => {
    expect(hitDieSize('5d8')).toBe(8);
    expect(hitDieSize('1d10')).toBe(10);
    expect(hitDieSize('12d12')).toBe(12);
  });

  it('accepts a bare die with no count', () => {
    expect(hitDieSize('d6')).toBe(6);
  });

  it('is not upset by spacing or case', () => {
    expect(hitDieSize(' 5D8 ')).toBe(8);
  });

  it('refuses anything that is not a die', () => {
    for (const bad of ['', '   ', '5', 'five', 'd', '5d', 'd0', '5d0', 'abc']) {
      expect(hitDieSize(bad)).toBeNull();
    }
  });

  it('survives a missing value rather than throwing', () => {
    expect(hitDieSize(undefined as unknown as string)).toBeNull();
    expect(hitDieSize(null as unknown as string)).toBeNull();
  });
});

describe('spendRoll', () => {
  it('adds the Constitution modifier to the die', () => {
    expect(spendRoll('1d8', 2)).toBe('1d8+2');
    expect(spendRoll('1d10', 0)).toBe('1d10+0');
  });

  it('keeps a negative Constitution modifier', () => {
    // The rules floor the hit points regained at 0, not the roll itself.
    expect(spendRoll('1d6', -1)).toBe('1d6-1');
  });

  it('adds it to a compound die too, without rewriting the die', () => {
    expect(spendRoll('2d6', 2)).toBe('2d6+2');
    expect(spendRoll('1d10+1', 2)).toBe('1d10+1+2');
  });
});

/**
 * `die` holds one hit die's roll and `maximum` how many there are, each with a
 * single fixed meaning. `total` is the older field that packed both into one
 * string; it is still read so existing sheets keep working, but never written.
 */
describe('hitDieExpression', () => {
  it('uses `die` when the sheet has one', () => {
    expect(hitDieExpression({ class: 'fighter', die: 'd10', maximum: 5, remaining: 3 })).toBe('d10');
  });

  it('allows a compound hit die, which is the point of the field', () => {
    expect(hitDieExpression({ class: 'brawler', die: '2d6', maximum: 4, remaining: 4 })).toBe('2d6');
    expect(hitDieExpression({ class: 'homebrew', die: '1d10+1', maximum: 2, remaining: 2 })).toBe('1d10+1');
  });

  it('falls back to the older pool string, taking one die out of it', () => {
    expect(hitDieExpression({ class: 'fighter', total: '5d10', remaining: 3 })).toBe('1d10');
    expect(hitDieExpression({ class: 'wizard', total: 'd6', remaining: 1 })).toBe('1d6');
  });

  it('prefers `die` over a stale pool string', () => {
    expect(hitDieExpression({ class: 'fighter', die: '2d6', total: '5d10', remaining: 3 })).toBe('2d6');
  });

  it('refuses a `die` the dice parser would reject, rather than rolling nonsense', () => {
    expect(hitDieExpression({ class: 'x', die: 'not dice', maximum: 1, remaining: 1 })).toBeNull();
    expect(hitDieExpression({ class: 'x', die: '', remaining: 1 })).toBeNull();
  });

  it('has nothing to offer when neither field describes a die', () => {
    expect(hitDieExpression({ class: 'x', total: '', remaining: 3 })).toBeNull();
    expect(hitDieExpression({ class: 'x', remaining: 3 })).toBeNull();
  });
});

describe('hitDiceMaximum', () => {
  it('uses `maximum` when the sheet has one', () => {
    expect(hitDiceMaximum({ class: 'f', die: 'd10', maximum: 5, remaining: 3 })).toBe(5);
  });

  it('reads the count out of the older pool string', () => {
    expect(hitDiceMaximum({ class: 'f', total: '5d10', remaining: 3 })).toBe(5);
  });

  it('does not invent a maximum from a bare die', () => {
    // "d10" is someone writing only the die. A sheet holding it with five
    // remaining is real, and reporting a maximum of one would read as 5/1.
    expect(hitDiceMaximum({ class: 'f', total: 'd10', remaining: 5 })).toBeNull();
    expect(hitDiceMaximum({ class: 'f', total: 'd10', remaining: 1 })).toBeNull();
  });

  it('refuses a maximum that is smaller than what is left', () => {
    expect(hitDiceMaximum({ class: 'f', die: 'd10', maximum: 1, remaining: 5 })).toBeNull();
    expect(hitDiceMaximum({ class: 'f', total: '2d10', remaining: 5 })).toBeNull();
  });

  it('is unknown when nothing records it', () => {
    expect(hitDiceMaximum({ class: 'f', die: 'd10', remaining: 3 })).toBeNull();
    expect(hitDiceMaximum({ class: 'f', total: '', remaining: 3 })).toBeNull();
  });
});

describe('canSpendHitDie', () => {
  it('allows a spend when dice remain and the total is a die', () => {
    expect(canSpendHitDie({ class: 'fighter', total: '5d10', remaining: 3 })).toBe(true);
  });

  it('allows a spend from the newer fields, compound die included', () => {
    expect(canSpendHitDie({ class: 'brawler', die: '2d6', maximum: 4, remaining: 4 })).toBe(true);
  });

  it('refuses a die the parser rejects', () => {
    expect(canSpendHitDie({ class: 'x', die: 'nonsense', maximum: 4, remaining: 4 })).toBe(false);
  });

  it('refuses when none remain', () => {
    expect(canSpendHitDie({ class: 'fighter', total: '5d10', remaining: 0 })).toBe(false);
  });

  it('refuses when the total is not a die, however many remain', () => {
    expect(canSpendHitDie({ class: 'fighter', total: '', remaining: 5 })).toBe(false);
    expect(canSpendHitDie({ class: 'fighter', total: 'five', remaining: 5 })).toBe(false);
  });
});
