/**
 * Fantasy d20 derived numbers.
 *
 * The built-in Level 1 Fighter shipped Armor Class 18 and Class DC 17, each one
 * higher than the rules give — and each inconsistent with the components stored
 * beside it, which said scale mail (+3), trained, Dex cap +2, key attribute
 * Strength. The read-only sheet printed the stored total, so the wrong numbers
 * were what a player saw.
 *
 * Formulas from the rules:
 *   Armor Class = 10 + Dexterity modifier (up to the armour's Dex Cap)
 *                    + proficiency bonus + armour's item bonus
 *   Class DC    = 10 + proficiency bonus + key attribute modifier
 *   Trained proficiency bonus = your level + 2
 */

import { describe, it, expect } from 'vitest';
import { fantasyD20ProficiencyBonus, fantasyD20ArmorClass, fantasyD20ClassDC, fantasyD20MaxHitPoints } from '../rules/fantasyD20';

/** The built-in Level 1 dwarf Fighter, as its own stored components describe it. */
const maren = {
  level: 1,
  attributes: {
    strength: { score: 16, modifier: 3 },
    dexterity: { score: 12, modifier: 1 },
    constitution: { score: 14, modifier: 2 },
    intelligence: { score: 10, modifier: 0 },
    wisdom: { score: 12, modifier: 1 },
    charisma: { score: 8, modifier: -1 },
  },
  armorClass: { proficiencyRank: 'trained', itemBonus: 3, capDex: 2, armorPenalty: -2 },
  classDC: { proficiencyRank: 'trained', keyAttribute: 'str' },
};

describe('fantasyD20ProficiencyBonus', () => {
  it.each([
    ['untrained', 1, 0],
    ['trained', 1, 3],
    ['expert', 1, 5],
    ['master', 1, 7],
    ['legendary', 1, 9],
    ['trained', 5, 7],
    ['expert', 10, 14],
  ])('%s at level %i is +%i', (rank, level, expected) => {
    expect(fantasyD20ProficiencyBonus(level, rank)).toBe(expected);
  });

  it('adds nothing at all when untrained, not even the level', () => {
    expect(fantasyD20ProficiencyBonus(20, 'untrained')).toBe(0);
  });

  it('treats an unrecognised rank as untrained', () => {
    expect(fantasyD20ProficiencyBonus(5, 'legendary+')).toBe(0);
    expect(fantasyD20ProficiencyBonus(5, undefined)).toBe(0);
  });
});

describe('fantasyD20ArmorClass', () => {
  it('gives the built-in Fighter 17, not the 18 that was stored', () => {
    // 10 + Dex 1 (under the +2 cap) + trained 3 + scale mail 3
    expect(fantasyD20ArmorClass(maren)).toBe(17);
  });

  it('caps the Dexterity modifier at the armour Dex Cap', () => {
    const nimble = {
      ...maren,
      attributes: { ...maren.attributes, dexterity: { score: 18, modifier: 4 } },
    };
    // Dex +4 capped to +2: 10 + 2 + 3 + 3
    expect(fantasyD20ArmorClass(nimble)).toBe(18);
  });

  it('applies the whole modifier when there is no cap', () => {
    const unarmoured = {
      ...maren,
      attributes: { ...maren.attributes, dexterity: { score: 18, modifier: 4 } },
      armorClass: { proficiencyRank: 'trained', itemBonus: 0, capDex: null },
    };
    expect(fantasyD20ArmorClass(unarmoured)).toBe(17); // 10 + 4 + 3 + 0
  });

  it('ignores the armour check penalty, which never applies to AC', () => {
    const worse = { ...maren, armorClass: { ...maren.armorClass, armorPenalty: -10 } };
    expect(fantasyD20ArmorClass(worse)).toBe(17);
  });

  it('is 10 for a sheet with no armour class recorded', () => {
    expect(fantasyD20ArmorClass({ level: 1 })).toBe(10);
    expect(fantasyD20ArmorClass(null)).toBe(10);
  });
});

describe('fantasyD20ClassDC', () => {
  it('gives the built-in Fighter 16, not the 17 that was stored', () => {
    // 10 + trained 3 + Strength 3
    expect(fantasyD20ClassDC(maren)).toBe(16);
  });

  /**
   * A sheet that never recorded a key attribute must not silently borrow one.
   *
   * The lookup accepted a prefix so that "str" would find "strength", but an
   * empty key is a prefix of every name — so `find` returned whichever
   * attribute the object happened to list first, which is Strength on every
   * sheet the app writes. A wizard with no key attribute recorded therefore got
   * a Class DC built from their Strength, and nothing on the sheet said so.
   */
  it('does not fall back to the first attribute when none is recorded', () => {
    const noKey = { ...maren, classDC: { proficiencyRank: 'trained' } };
    // 10 + trained 3 + nothing. Not 16, which would be Strength quietly used.
    expect(fantasyD20ClassDC(noKey)).toBe(13);
  });

  it('does not use a blank or whitespace key attribute', () => {
    expect(fantasyD20ClassDC({ ...maren, classDC: { keyAttribute: '', proficiencyRank: 'trained' } }))
      .toBe(13);
    expect(fantasyD20ClassDC({ ...maren, classDC: { keyAttribute: '   ', proficiencyRank: 'trained' } }))
      .toBe(13);
  });

  it('ignores a key attribute that names nothing on the sheet', () => {
    const nonsense = { ...maren, classDC: { keyAttribute: 'luck', proficiencyRank: 'trained' } };
    expect(fantasyD20ClassDC(nonsense)).toBe(13);
  });

  it('reads the key attribute written in full as well as abbreviated', () => {
    expect(fantasyD20ClassDC({ ...maren, classDC: { ...maren.classDC, keyAttribute: 'strength' } })).toBe(16);
  });

  it('uses whichever attribute the class names', () => {
    const wizard = { ...maren, classDC: { proficiencyRank: 'trained', keyAttribute: 'intelligence' } };
    expect(fantasyD20ClassDC(wizard)).toBe(13); // 10 + 3 + INT 0
  });

  it('is 10 for a sheet with no class DC recorded', () => {
    expect(fantasyD20ClassDC({ level: 1 })).toBe(10);
    expect(fantasyD20ClassDC(undefined)).toBe(10);
  });

  it('does not throw on an attribute the sheet does not have', () => {
    const odd = { ...maren, classDC: { proficiencyRank: 'trained', keyAttribute: 'luck' } };
    expect(() => fantasyD20ClassDC(odd)).not.toThrow();
    expect(fantasyD20ClassDC(odd)).toBe(13); // 10 + 3 + 0
  });
});

describe('fantasyD20MaxHitPoints', () => {
  it.each([
    // Dwarf (10) Fighter (10) with Constitution +2 at level 1.
    [10, 10, 1, 2, 22],
    // Human (8) Fighter (10) with Constitution +0.
    [8, 10, 1, 0, 18],
    // Elf (6) Wizard (6) with Constitution -1 at level 5.
    [6, 6, 5, -1, 31],
  ])('ancestry %i, class %i, level %i, Constitution %i give %i', (ancestry, cls, level, con, expected) => {
    expect(fantasyD20MaxHitPoints(ancestry, cls, level, con)).toBe(expected);
  });

  it('is at least 1', () => {
    expect(fantasyD20MaxHitPoints(0, 0, 1, -2)).toBe(1);
  });
});
