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
import { hitDieSize, hitDieRoll, canSpendHitDie } from '../hitDice';

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

describe('hitDieRoll', () => {
  it('rolls one die plus the Constitution modifier', () => {
    expect(hitDieRoll(8, 2)).toBe('1d8+2');
    expect(hitDieRoll(10, 0)).toBe('1d10+0');
  });

  it('keeps a negative Constitution modifier', () => {
    // The rules floor the hit points regained at 0, not the roll itself.
    expect(hitDieRoll(6, -1)).toBe('1d6-1');
  });
});

describe('canSpendHitDie', () => {
  it('allows a spend when dice remain and the total is a die', () => {
    expect(canSpendHitDie({ class: 'fighter', total: '5d10', remaining: 3 })).toBe(true);
  });

  it('refuses when none remain', () => {
    expect(canSpendHitDie({ class: 'fighter', total: '5d10', remaining: 0 })).toBe(false);
  });

  it('refuses when the total is not a die, however many remain', () => {
    expect(canSpendHitDie({ class: 'fighter', total: '', remaining: 5 })).toBe(false);
    expect(canSpendHitDie({ class: 'fighter', total: 'five', remaining: 5 })).toBe(false);
  });
});
