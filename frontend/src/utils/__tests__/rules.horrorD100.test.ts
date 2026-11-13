/**
 * The Horror d100 rules the sheet and the roll menu work out in the browser:
 * the rolls a characteristic gives, the derived attributes, a weapon's damage
 * with the damage modifier, and the skill a weapon names. The backend's suite
 * tests the same file line for line, and holds the two copies identical.
 */

import { describe, it, expect } from 'vitest';
import {
  horrorD100CharacteristicRoll,
  horrorD100DamageModifier,
  horrorD100DamageWithModifier,
  horrorD100ExperienceBonus,
  horrorD100MajorWoundLevel,
  horrorD100MaximumHitPoints,
  horrorD100MaximumPowerPoints,
  horrorD100MaximumSanity,
  horrorD100NewSkills,
  horrorD100WeaponSkillRating,
} from '../rules/horrorD100';

describe('the derived attributes', () => {
  it('rolls a characteristic at five times its value', () => {
    expect(horrorD100CharacteristicRoll(13)).toBe(65);
  });

  it('halves CON plus SIZ for hit points, and those for the major wound level, each rounded up', () => {
    expect(horrorD100MaximumHitPoints(12, 13)).toBe(13);
    expect(horrorD100MaximumHitPoints(10, 10)).toBe(10);
    expect(horrorD100MajorWoundLevel(13)).toBe(7);
    expect(horrorD100MajorWoundLevel(12)).toBe(6);
  });

  it('gives power points equal to POW and an experience bonus of half INT, rounded up', () => {
    expect(horrorD100MaximumPowerPoints(14)).toBe(14);
    expect(horrorD100ExperienceBonus(15)).toBe(8);
  });

  it.each([
    [12, '-1D6'], [16, '-1D4'], [17, 'None'], [24, 'None'], [25, '+1D4'], [32, '+1D4'], [33, '+1D6'], [40, '+1D6'],
    [41, '+2D6'], [56, '+2D6'], [57, '+3D6'],
  ])('STR plus SIZ of %i gives a damage modifier of %s', (total, modifier) => {
    expect(horrorD100DamageModifier(total - 8, 8)).toBe(modifier);
  });

  it('takes Knowledge (Blasphemous Lore) off 100 for maximum Sanity, from 0 to 99', () => {
    expect(horrorD100MaximumSanity(0)).toBe(99);
    expect(horrorD100MaximumSanity(43)).toBe(57);
    expect(horrorD100MaximumSanity(120)).toBe(0);
  });
});

// A weapon's damage is written with the damage modifier as dm ("1D3+dm" for
// a fist), or as DB by the sheet before it was rebuilt, which the dice cannot
// read; the character's damage modifier goes in its place. A firearm adds no
// modifier, so a gun's damage carries none to replace.
describe('horrorD100DamageWithModifier', () => {
  it.each([
    ['1d3+DB', '0', '1d3'],
    ['1d3+DB', '+1d4', '1d3+1d4'],
    ['1d8 + db', '+2d6', '1d8+2d6'],
    ['1d6+DB', '-1', '1d6-1'],
    ['1d10', '+1d4', '1d10'],
    // Half the modifier, for a thrown weapon or a bow: none when there is
    // none. There is no way to halve dice, so the text is kept.
    ['1d3+half DB', '0', '1d3'],
    ['1d8 + ½DB', '0', '1d8'],
    ['1d6+1/2 DB', '0', '1d6'],
    ['1d3+half DB', '+1d4', '1d3+half DB'],
    // The open d100 rules' notation, and their table's "None".
    ['1D3+dm', '+1D4', '1D3+1D4'],
    ['1D3+dm', '-1D6', '1D3-1D6'],
    ['1D3+dm', 'None', '1D3'],
    ['1D3+½dm', 'None', '1D3'],
    ['1D8+½dm', '+1D4', '1D8+½dm'],
  ])('writes %s with a damage modifier of %s as %s', (damage, bonus, expected) => {
    expect(horrorD100DamageWithModifier(damage, bonus)).toBe(expected);
  });
});

// A weapon stores a copy of its skill's value, which goes stale as the skill
// rises; the skill it names is read where the sheet has it, by the open d100
// rules' name or the one the sheet printed before it was rebuilt.
describe('horrorD100WeaponSkillRating', () => {
  const rated = (value: number) => ({ value, experienceCheck: false });
  const skills = {
    ...horrorD100NewSkills({ DEX: 10, INT: 10, POW: 10 }),
    brawl: rated(55),
    throw: rated(35),
    firearm: [{ specialty: 'Handgun', ...rated(45) }, { specialty: 'Rifle', ...rated(30) }, { specialty: 'Shotgun', ...rated(50) }],
    meleeWeapon: [{ specialty: 'Sword', ...rated(40) }],
    own: [{ name: 'Charm', ...rated(60) }],
  };

  it.each([
    ['Brawl', 55], ['brawl', 55], ['Throw', 35], ['Firearm (Handgun)', 45], ['Melee Weapon (Sword)', 40], ['Sword', 40],
    ['Charm', 60],
  ])('reads %s by the name the sheet lists it under', (name, value) => {
    expect(horrorD100WeaponSkillRating(skills, name, 20)).toBe(value);
  });

  it.each([
    ['Fighting (Brawl)', 55], ['Fighting (Sword)', 40], ['Firearms (Handgun)', 45], ['Handgun', 45],
    ['Rifle/Shotgun', 50], ['Firearms (Rifle/Shotgun)', 50], ['Firearm (Rifle or Shotgun)', 50],
  ])('reads %s, as the sheet named it before it was rebuilt', (name, value) => {
    expect(horrorD100WeaponSkillRating(skills, name, 20)).toBe(value);
  });

  it('falls back on the value kept with the weapon where the sheet has no such skill', () => {
    expect(horrorD100WeaponSkillRating(skills, 'Whip', 20)).toBe(20);
    expect(horrorD100WeaponSkillRating(skills, '', 20)).toBe(20);
    expect(horrorD100WeaponSkillRating(undefined, 'Brawl', 20)).toBe(20);
  });
});
