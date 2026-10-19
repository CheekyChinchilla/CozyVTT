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
  cocMajorWoundThreshold,
  cocDamageWithBonus,
  cocWeaponSkillValue,
} from '../rules/callOfCthulhu7e';

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
    // "Add an additional 1D6 to Damage Bonus and +1 to Build for each
    // additional 80 points or fraction thereof" past 524.
    [525, '+6d6', 7], [604, '+6d6', 7],
    [605, '+7d6', 8], [700, '+8d6', 9],
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

// Keeper Rulebook, "Major wounds": damage "equal to or greater than half of
// the character's maximum hit points in a single attack". Damage is a whole
// number, so at 13 hit points a 6 is under half and a 7 is a major wound.
describe('major wound threshold', () => {
  it('is half the maximum hit points, rounded up', () => {
    expect(cocMajorWoundThreshold(13)).toBe(7);
    expect(cocMajorWoundThreshold(12)).toBe(6);
  });

  it('is at least 1', () => {
    expect(cocMajorWoundThreshold(1)).toBe(1);
    expect(cocMajorWoundThreshold(0)).toBe(1);
  });
});

// A weapon's damage is written with the damage bonus as DB ("1d3+DB" for a
// punch), which the dice cannot read; the sheet's damage bonus goes in its
// place. "Damage bonus is not applied to firearms", so a gun's damage carries
// no DB to replace.
describe('cocDamageWithBonus', () => {
  it.each([
    ['1d3+DB', '0', '1d3'],
    ['1d3+DB', '+1d4', '1d3+1d4'],
    ['1d8 + db', '+2d6', '1d8+2d6'],
    ['1d6+DB', '-1', '1d6-1'],
    ['1d10', '+1d4', '1d10'],
    // Half the bonus, for a thrown weapon or a bow: none when there is none.
    // The rules give no way to halve a bonus in dice, so the text is kept.
    ['1d3+half DB', '0', '1d3'],
    ['1d8 + ½DB', '0', '1d8'],
    ['1d6+1/2 DB', '0', '1d6'],
    ['1d3+half DB', '+1d4', '1d3+half DB'],
  ])('writes %s with a damage bonus of %s as %s', (damage, bonus, expected) => {
    expect(cocDamageWithBonus(damage, bonus)).toBe(expected);
  });
});

// A weapon stores a copy of its skill's value, which went stale as the skill
// rose; the skill it names is read where there is one.
describe('cocWeaponSkillValue', () => {
  const skill = (value: number, extra: Record<string, unknown> = {}) => ({ currentValue: value, ...extra });
  const skills = {
    fighting: { brawl: skill(50), custom: [skill(45, { specialization: 'Sword' })] },
    firearms: { handgun: skill(60), rifle: skill(35), shotgun: skill(30), custom: [] },
    throw: skill(40),
  };

  it.each([
    ['Brawl', 50], ['Fighting (Brawl)', 50], ['Sword', 45], ['fighting (sword)', 45],
    ['Handgun', 60], ['Firearms (Rifle)', 35], ['Rifle/Shotgun', 35], ['Throw', 40],
  ])('reads %s', (name, value) => {
    expect(cocWeaponSkillValue(skills, name, 20)).toBe(value);
  });

  // The rulebook's Rifle/Shotgun is one skill, which the sheet keeps as two.
  it('reads Rifle/Shotgun as the higher of the two', () => {
    const shotgunHigher = { ...skills, firearms: { ...skills.firearms, shotgun: skill(55) } };
    expect(cocWeaponSkillValue(shotgunHigher, 'Rifle/Shotgun', 20)).toBe(55);
    expect(cocWeaponSkillValue(shotgunHigher, 'Firearms (Rifle/Shotgun)', 20)).toBe(55);
  });

  it('keeps the stored value for a skill the sheet does not have', () => {
    expect(cocWeaponSkillValue(skills, 'Whip', 20)).toBe(20);
    expect(cocWeaponSkillValue(skills, '', 20)).toBe(20);
  });
});
