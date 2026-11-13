/**
 * Fantasy d20 Bulk, checked against the rules: every ten light items make 1
 * Bulk and a remainder is dropped, so 9 light items are no Bulk and 11 are 1.
 * A character carries up to 5 plus their Strength modifier in Bulk freely, is
 * encumbered above that, and cannot carry more than 10 plus their Strength
 * modifier.
 */
import { describe, it, expect } from '@jest/globals';
import {
  fantasyD20ItemBulk,
  fantasyD20TotalBulk,
  fantasyD20BulkLimits,
  formatFantasyD20Bulk,
  fantasyD20SpellAttack,
  fantasyD20SpellDC,
  fantasyD20SkillTotal,
  fantasyD20CheckPenalty,
  fantasyD20SaveTotal,
  fantasyD20PerceptionTotal,
} from '../fantasyD20';

describe('fantasyD20ItemBulk', () => {
  it.each([
    [2, { bulk: 2, light: 0 }],
    ['2', { bulk: 2, light: 0 }],
    [' 3 ', { bulk: 3, light: 0 }],
    ['L', { bulk: 0, light: 1 }],
    ['l', { bulk: 0, light: 1 }],
    [0.1, { bulk: 0, light: 1 }],
    ['—', { bulk: 0, light: 0 }],
    ['-', { bulk: 0, light: 0 }],
    ['', { bulk: 0, light: 0 }],
    [undefined, { bulk: 0, light: 0 }],
    [null, { bulk: 0, light: 0 }],
    ['heavy', { bulk: 0, light: 0 }],
    [-2, { bulk: 0, light: 0 }],
  ])('reads %j', (value, expected) => {
    expect(fantasyD20ItemBulk(value)).toEqual(expected);
  });
});

describe('fantasyD20TotalBulk', () => {
  it('counts ten light items as 1 Bulk and rounds the rest down', () => {
    expect(fantasyD20TotalBulk([{ bulk: 'L', quantity: 9 }])).toEqual({ bulk: 0, light: 9 });
    expect(fantasyD20TotalBulk([{ bulk: 'L', quantity: 11 }])).toEqual({ bulk: 1, light: 1 });
  });

  it('multiplies by quantity, counting a missing quantity as one item and 0 as none', () => {
    expect(fantasyD20TotalBulk([{ bulk: 2 }, { bulk: '1', quantity: 3 }, { bulk: 4, quantity: 0 }])).toEqual({ bulk: 5, light: 0 });
  });

  it('takes no inventory as nothing carried', () => {
    expect(fantasyD20TotalBulk(undefined)).toEqual({ bulk: 0, light: 0 });
  });
});

describe('fantasyD20BulkLimits', () => {
  it('is 5 and 10 plus the Strength modifier', () => {
    expect(fantasyD20BulkLimits(3)).toMatchObject({ encumbered: 8, maximum: 13 });
  });

  it('marks a character encumbered only above 5 + STR, and overloaded only above 10 + STR', () => {
    const at = (bulk: number) => fantasyD20BulkLimits(0, bulk);
    expect(at(5)).toMatchObject({ isEncumbered: false, isOverloaded: false });
    expect(at(6)).toMatchObject({ isEncumbered: true, isOverloaded: false });
    expect(at(10)).toMatchObject({ isEncumbered: true, isOverloaded: false });
    expect(at(11)).toMatchObject({ isEncumbered: true, isOverloaded: true });
  });
});

describe('formatFantasyD20Bulk', () => {
  it.each([
    [{ bulk: 0, light: 0 }, '—'],
    [{ bulk: 0, light: 3 }, '3 L'],
    [{ bulk: 5, light: 0 }, '5'],
    [{ bulk: 5, light: 2 }, '5 and 2 L'],
  ])('writes %j as %s', (total, text) => {
    expect(formatFantasyD20Bulk(total)).toBe(text);
  });
});

/**
 * In the rules a spell attack roll adds the spellcasting attribute's
 * modifier, the proficiency bonus and any other bonuses and penalties, and a
 * spell DC is 10 plus the same, with one proficiency rank for both.
 */
describe('fantasyD20SpellAttack and fantasyD20SpellDC', () => {
  const wizard = (spellcasting: Record<string, unknown>) => ({
    level: 3,
    attributes: { intelligence: { score: 18, modifier: 4 } },
    spellcasting: { keyAttribute: 'int', ...spellcasting },
  });

  it('add the key attribute and the spellcasting rank, which the DC shares', () => {
    const sheet = wizard({ spellAttackBonus: { proficiencyRank: 'expert', itemBonus: 0 }, spellDC: { proficiencyRank: 'trained', itemBonus: 0 } });
    // Level 3 expert: 3 + 4 = +7.
    expect(fantasyD20SpellAttack(sheet)).toBe(11);
    expect(fantasyD20SpellDC(sheet)).toBe(21);
  });

  it('count each item bonus toward its own total only', () => {
    const sheet = wizard({ spellAttackBonus: { proficiencyRank: 'trained', itemBonus: 1 }, spellDC: { proficiencyRank: 'trained', itemBonus: 2 } });
    expect(fantasyD20SpellAttack(sheet)).toBe(4 + 5 + 1);
    expect(fantasyD20SpellDC(sheet)).toBe(10 + 4 + 5 + 2);
  });

  it('are the bare base with no spellcasting', () => {
    expect(fantasyD20SpellAttack({ level: 1 })).toBe(0);
    expect(fantasyD20SpellDC({ level: 1 })).toBe(10);
  });
});

/**
 * In the rules a penalty always lowers a total; armor prints its check
 * penalty as -1, -2 or -3. A stored check penalty is a penalty whatever its
 * sign.
 */
describe('fantasyD20SkillTotal', () => {
  const sheet = { level: 1, attributes: { strength: { score: 16, modifier: 3 } } };
  const athletics = (armorPenalty: number) => ({ attribute: 'str', proficiencyRank: 'trained', itemBonus: 1, armorPenalty });

  it('adds the attribute, the proficiency bonus and the item bonus', () => {
    expect(fantasyD20SkillTotal(sheet, athletics(0))).toBe(3 + 3 + 1);
  });

  it('takes the check penalty off whichever sign it was stored with', () => {
    expect(fantasyD20SkillTotal(sheet, athletics(-2))).toBe(5);
    expect(fantasyD20SkillTotal(sheet, athletics(2))).toBe(5);
  });

  it('reads a check penalty as never more than 0', () => {
    expect(fantasyD20CheckPenalty(2)).toBe(-2);
    expect(fantasyD20CheckPenalty(-3)).toBe(-3);
    expect(fantasyD20CheckPenalty(undefined)).toBe(0);
  });
});

/**
 * Saving throws and Perception, as the rules add them up: the Constitution
 * modifier for Fortitude, Dexterity for Reflex or Wisdom for Will, plus the
 * proficiency bonus and any other bonuses and penalties, and Perception the
 * same with Wisdom.
 */
describe('fantasyD20SaveTotal and fantasyD20PerceptionTotal', () => {
  const sheet = {
    level: 2,
    attributes: { constitution: { modifier: 3 }, dexterity: { modifier: 1 }, wisdom: { modifier: 2 } },
    savingThrows: {
      fortitude: { proficiencyRank: 'expert', itemBonus: 0 },
      reflex: { proficiencyRank: 'trained', itemBonus: 1 },
      will: { proficiencyRank: 'untrained', itemBonus: 0 },
    },
    perception: { proficiencyRank: 'trained', itemBonus: 1 },
  };

  it('adds each save\'s attribute, rank and item bonus', () => {
    expect(fantasyD20SaveTotal(sheet, 'fortitude')).toBe(3 + 6);
    expect(fantasyD20SaveTotal(sheet, 'reflex')).toBe(1 + 4 + 1);
    expect(fantasyD20SaveTotal(sheet, 'will')).toBe(2);
  });

  it('adds Wisdom, the rank and the item bonus to Perception', () => {
    expect(fantasyD20PerceptionTotal(sheet)).toBe(2 + 4 + 1);
  });

  it('is the attribute alone for a sheet that records no rank', () => {
    expect(fantasyD20SaveTotal({ attributes: { wisdom: { modifier: 1 } } }, 'will')).toBe(1);
    expect(fantasyD20PerceptionTotal({})).toBe(0);
  });
});

describe('the spellcasting rank on a sheet with no spell attack', () => {
  it('is the spell DC\'s, so an imported DC keeps its rank', () => {
    const sheet = { level: 5, attributes: { intelligence: { modifier: 4 } }, spellcasting: { keyAttribute: 'int', spellDC: { proficiencyRank: 'expert', itemBonus: 0, dc: 23 } } };
    expect(fantasyD20SpellDC(sheet)).toBe(23);
    expect(fantasyD20SpellAttack(sheet)).toBe(13);
  });
});

/**
 * Coins in the rules: every 1,000 coins, of any kinds together, make 1 Bulk,
 * and a remainder is dropped, so 100 coins are not even a light item and
 * 1,999 coins are 1 Bulk.
 */
describe('coins in fantasyD20TotalBulk', () => {
  it('count 1 Bulk a thousand, of any mix, rounded down', () => {
    expect(fantasyD20TotalBulk([], { cp: 500, sp: 400, gp: 99, pp: 0 })).toEqual({ bulk: 0, light: 0 });
    expect(fantasyD20TotalBulk([], { cp: 0, sp: 0, gp: 1999, pp: 0 })).toEqual({ bulk: 1, light: 0 });
    expect(fantasyD20TotalBulk([{ bulk: 2 }], { cp: 1000, sp: 1000, gp: 0, pp: 500 })).toEqual({ bulk: 4, light: 0 });
  });

  it('add nothing for no purse', () => {
    expect(fantasyD20TotalBulk([{ bulk: 2 }])).toEqual({ bulk: 2, light: 0 });
  });
});
