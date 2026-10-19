/**
 * D&D 5e spell slots are held to a total a sheet can draw.
 *
 * The sheet draws one mark per slot, and the schema took any whole number, so
 * a player could store five million slots of one level and freeze the browser
 * of anyone who opened their Spells tab. Used slots could also be more than
 * the total, which showed a negative number left.
 */

import { describe, it, expect } from '@jest/globals';
import { GameSystem } from '../../../game-systems';
import { getBlankCharacterTemplate, validateCharacterData } from '../index';
import { SPELL_SLOTS_MAX } from '../sheetLimits';

function withSlots(level1: { total: number; expended: number }): Record<string, unknown> {
  const slots = Object.fromEntries(
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((level) => [level, { total: 0, expended: 0 }])
  );
  return {
    ...(getBlankCharacterTemplate(GameSystem.DND_5E) as Record<string, unknown>),
    spellcasting: { ability: 'Wisdom', slots: { ...slots, '1': level1 } },
  };
}

function issuePaths(data: unknown): string[] {
  const result = validateCharacterData(GameSystem.DND_5E, data);
  return result.success ? [] : result.errors.issues.map((issue) => issue.path.join('.'));
}

describe('D&D 5e spell slots', () => {
  it('refuses a total of 5,000,000', () => {
    expect(issuePaths(withSlots({ total: 5_000_000, expended: 0 }))).toContain('spellcasting.slots.1.total');
  });

  it(`refuses a total over ${SPELL_SLOTS_MAX}`, () => {
    expect(issuePaths(withSlots({ total: SPELL_SLOTS_MAX + 1, expended: 0 }))).toContain('spellcasting.slots.1.total');
  });

  it('refuses more slots used than the total', () => {
    expect(issuePaths(withSlots({ total: 2, expended: 3 }))).toContain('spellcasting.slots.1.expended');
  });

  it(`accepts ${SPELL_SLOTS_MAX} slots, all used`, () => {
    expect(issuePaths(withSlots({ total: SPELL_SLOTS_MAX, expended: SPELL_SLOTS_MAX }))).toEqual([]);
  });

  it('accepts a spellcasting block with an ability and nothing else', () => {
    const data = {
      ...(getBlankCharacterTemplate(GameSystem.DND_5E) as Record<string, unknown>),
      spellcasting: { ability: 'Wisdom', cantrips: [] },
    };
    expect(issuePaths(data)).toEqual([]);
  });
});

// Pathfinder 2e held used slots to 0 to 20 but not to the total, so a rank
// could show a negative number left; D&D's rule now applies to it too.
describe('Pathfinder 2e spell slots', () => {
  function pf2eWithSlots(rank1: { total: number; expended: number }): Record<string, unknown> {
    const sheet = getBlankCharacterTemplate(GameSystem.PATHFINDER_2E) as unknown as Record<string, Record<string, unknown>>;
    const spellcasting = sheet.spellcasting;
    return { ...sheet, spellcasting: { ...spellcasting, slots: { ...(spellcasting.slots as Record<string, unknown>), '1': rank1 } } };
  }
  const pf2eIssuePaths = (data: unknown): string[] => {
    const result = validateCharacterData(GameSystem.PATHFINDER_2E, data);
    return result.success ? [] : result.errors.issues.map((issue) => issue.path.join('.'));
  };

  it('refuses more slots used than the total', () => {
    expect(pf2eIssuePaths(pf2eWithSlots({ total: 2, expended: 3 }))).toContain('spellcasting.slots.1.expended');
  });

  it('takes every slot used', () => {
    expect(pf2eIssuePaths(pf2eWithSlots({ total: 3, expended: 3 }))).toEqual([]);
  });
});
