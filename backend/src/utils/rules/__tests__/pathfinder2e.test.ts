/**
 * Pathfinder 2e Bulk, checked against the Core Rulebook (p. 272): "Ten light
 * items count as 1 Bulk, and you round down fractions (so 9 light items count
 * as 0 Bulk, and 11 light items count as 1 Bulk)", and a character can carry
 * "5 plus your Strength modifier without penalty; if you carry more, you gain
 * the encumbered condition. You can't hold or carry more Bulk than 10 plus
 * your Strength modifier."
 */
import { describe, it, expect } from '@jest/globals';
import {
  pf2eItemBulk,
  pf2eTotalBulk,
  pf2eBulkLimits,
  formatPf2eBulk,
  pf2eSpellAttack,
  pf2eSpellDC,
  pf2eSkillTotal,
  pf2eCheckPenalty,
} from '../pathfinder2e';

describe('pf2eItemBulk', () => {
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
    expect(pf2eItemBulk(value)).toEqual(expected);
  });
});

describe('pf2eTotalBulk', () => {
  it('counts ten light items as 1 Bulk and rounds the rest down', () => {
    expect(pf2eTotalBulk([{ bulk: 'L', quantity: 9 }])).toEqual({ bulk: 0, light: 9 });
    expect(pf2eTotalBulk([{ bulk: 'L', quantity: 11 }])).toEqual({ bulk: 1, light: 1 });
  });

  it('multiplies by quantity, counting a missing quantity as one item and 0 as none', () => {
    expect(pf2eTotalBulk([{ bulk: 2 }, { bulk: '1', quantity: 3 }, { bulk: 4, quantity: 0 }])).toEqual({ bulk: 5, light: 0 });
  });

  it('takes no inventory as nothing carried', () => {
    expect(pf2eTotalBulk(undefined)).toEqual({ bulk: 0, light: 0 });
  });
});

describe('pf2eBulkLimits', () => {
  it('is 5 and 10 plus the Strength modifier', () => {
    expect(pf2eBulkLimits(3)).toMatchObject({ encumbered: 8, maximum: 13 });
  });

  it('marks a character encumbered only above 5 + STR, and overloaded only above 10 + STR', () => {
    const at = (bulk: number) => pf2eBulkLimits(0, bulk);
    expect(at(5)).toMatchObject({ isEncumbered: false, isOverloaded: false });
    expect(at(6)).toMatchObject({ isEncumbered: true, isOverloaded: false });
    expect(at(10)).toMatchObject({ isEncumbered: true, isOverloaded: false });
    expect(at(11)).toMatchObject({ isEncumbered: true, isOverloaded: true });
  });
});

describe('formatPf2eBulk', () => {
  it.each([
    [{ bulk: 0, light: 0 }, '—'],
    [{ bulk: 0, light: 3 }, '3 L'],
    [{ bulk: 5, light: 0 }, '5'],
    [{ bulk: 5, light: 2 }, '5 and 2 L'],
  ])('writes %j as %s', (total, text) => {
    expect(formatPf2eBulk(total)).toBe(text);
  });
});

/**
 * Core Rulebook p. 298: "Spell attack roll = your spellcasting ability
 * modifier + proficiency bonus + other bonuses + penalties" and "Spell DC = 10
 * + your spellcasting ability modifier + proficiency bonus + other bonuses +
 * penalties", with one proficiency rank for both (p. 27).
 */
describe('pf2eSpellAttack and pf2eSpellDC', () => {
  const wizard = (spellcasting: Record<string, unknown>) => ({
    level: 3,
    attributes: { intelligence: { score: 18, modifier: 4 } },
    spellcasting: { keyAttribute: 'int', ...spellcasting },
  });

  it('add the key attribute and the spellcasting rank, which the DC shares', () => {
    const sheet = wizard({ spellAttackBonus: { proficiencyRank: 'expert', itemBonus: 0 }, spellDC: { proficiencyRank: 'trained', itemBonus: 0 } });
    // Level 3 expert: 3 + 4 = +7.
    expect(pf2eSpellAttack(sheet)).toBe(11);
    expect(pf2eSpellDC(sheet)).toBe(21);
  });

  it('count each item bonus toward its own total only', () => {
    const sheet = wizard({ spellAttackBonus: { proficiencyRank: 'trained', itemBonus: 1 }, spellDC: { proficiencyRank: 'trained', itemBonus: 2 } });
    expect(pf2eSpellAttack(sheet)).toBe(4 + 5 + 1);
    expect(pf2eSpellDC(sheet)).toBe(10 + 4 + 5 + 2);
  });

  it('are the bare base with no spellcasting', () => {
    expect(pf2eSpellAttack({ level: 1 })).toBe(0);
    expect(pf2eSpellDC({ level: 1 })).toBe(10);
  });
});

/**
 * Core Rulebook p. 444: "a bonus is always positive, and a penalty is always
 * negative"; armor prints its check penalty as -1, -2 or -3. A stored check
 * penalty is a penalty whatever its sign.
 */
describe('pf2eSkillTotal', () => {
  const sheet = { level: 1, attributes: { strength: { score: 16, modifier: 3 } } };
  const athletics = (armorPenalty: number) => ({ attribute: 'str', proficiencyRank: 'trained', itemBonus: 1, armorPenalty });

  it('adds the attribute, the proficiency bonus and the item bonus', () => {
    expect(pf2eSkillTotal(sheet, athletics(0))).toBe(3 + 3 + 1);
  });

  it('takes the check penalty off whichever sign it was stored with', () => {
    expect(pf2eSkillTotal(sheet, athletics(-2))).toBe(5);
    expect(pf2eSkillTotal(sheet, athletics(2))).toBe(5);
  });

  it('reads a check penalty as never more than 0', () => {
    expect(pf2eCheckPenalty(2)).toBe(-2);
    expect(pf2eCheckPenalty(-3)).toBe(-3);
    expect(pf2eCheckPenalty(undefined)).toBe(0);
  });
});
