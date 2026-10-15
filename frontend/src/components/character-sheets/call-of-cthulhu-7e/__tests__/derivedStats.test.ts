/**
 * The Call of Cthulhu derived attributes the editor works out from the
 * characteristics, checked against the Call of Cthulhu 7th Edition core
 * rulebook (its investigator creation steps, Table I: Damage Bonus and Build,
 * and the worked example of Harvey Walters).
 */

import { describe, it, expect } from 'vitest';
import {
  cocHitPoints,
  cocMagicPoints,
  cocDamageBonusAndBuild,
  cocMoveRate,
  cocMaxSanity,
  cocHalfAndFifth,
} from '../derivedStats';

describe('hit points', () => {
  it('are CON plus SIZ divided by ten, rounded down', () => {
    // Harvey Walters: CON 70, SIZ 80.
    expect(cocHitPoints(70, 80)).toBe(15);
    expect(cocHitPoints(55, 64)).toBe(11);
    expect(cocHitPoints(0, 0)).toBe(0);
  });
});

describe('magic points', () => {
  it('are one fifth of POW, rounded down', () => {
    expect(cocMagicPoints(50)).toBe(10);
    expect(cocMagicPoints(64)).toBe(12);
  });
});

describe('damage bonus and build', () => {
  it.each([
    [2, '-2', -2], [64, '-2', -2],
    [65, '-1', -1], [84, '-1', -1],
    [85, '0', 0], [100, '0', 0], [124, '0', 0],
    [125, '+1d4', 1], [164, '+1d4', 1],
    [165, '+1d6', 2], [204, '+1d6', 2],
    [205, '+2d6', 3], [284, '+2d6', 3],
    [285, '+3d6', 4], [364, '+3d6', 4],
    [365, '+4d6', 5], [444, '+4d6', 5],
    [445, '+5d6', 6], [524, '+5d6', 6],
  ])('STR plus SIZ of %i gives %s and build %i', (total, damageBonus, build) => {
    // Split the total between the two; only the sum counts.
    const str = Math.floor(total / 2);
    expect(cocDamageBonusAndBuild(str, total - str)).toEqual({ damageBonus, build });
  });
});

describe('move rate', () => {
  it('is 7 when STR and DEX are both below SIZ', () => {
    expect(cocMoveRate(40, 50, 60, 25)).toBe(7);
  });

  it('is 8 when either is at or above SIZ, or all three are equal', () => {
    expect(cocMoveRate(70, 50, 60, 25)).toBe(8);
    expect(cocMoveRate(60, 50, 60, 25)).toBe(8);
    expect(cocMoveRate(50, 50, 50, 25)).toBe(8);
  });

  it('is 9 when STR and DEX are both above SIZ', () => {
    expect(cocMoveRate(70, 80, 60, 25)).toBe(9);
  });

  it.each([
    [39, 8], [40, 7], [49, 7], [50, 6], [60, 5], [70, 4], [80, 3], [89, 3],
  ])('loses a point for each decade from the 40s on: at %i, an 8 becomes %i', (age, rate) => {
    expect(cocMoveRate(60, 60, 60, age)).toBe(rate);
  });
});

describe('maximum sanity', () => {
  it('is 99 less the Cthulhu Mythos skill', () => {
    // Harvey Walters, with 8% Cthulhu Mythos.
    expect(cocMaxSanity(8)).toBe(91);
    expect(cocMaxSanity(0)).toBe(99);
  });
});

describe('half and fifth values', () => {
  it('are each characteristic halved and divided by five, rounded down', () => {
    expect(cocHalfAndFifth(65)).toEqual({ half: 32, fifth: 13 });
    expect(cocHalfAndFifth(0)).toEqual({ half: 0, fifth: 0 });
  });
});
