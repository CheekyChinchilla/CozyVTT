/**
 * The D&D 5e sheet's manual bonuses are held to the same range as a custom
 * skill's other bonus.
 *
 * Initiative, passive Perception and the two spellcasting "other bonus" boxes
 * took any whole number. An initiative bonus over the dice roller's limit made
 * the roll fall back to a flat d20, and none of them has a legitimate value
 * anywhere near that.
 */

import { describe, it, expect } from '@jest/globals';
import { GameSystem } from '../../../game-systems';
import { getBlankCharacterTemplate, validateCharacterData } from '../index';
import { MAX_BONUS_OVERRIDE, MIN_BONUS_OVERRIDE } from '../../../utils/rules/dnd5e';

function sheet(extra: Record<string, unknown>, spellcasting: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...(getBlankCharacterTemplate(GameSystem.DND_5E) as Record<string, unknown>),
    ...extra,
    spellcasting: { ability: 'Intelligence', ...spellcasting },
  };
}

function issuePaths(data: unknown): string[] {
  const result = validateCharacterData(GameSystem.DND_5E, data);
  return result.success ? [] : result.errors.issues.map((issue) => issue.path.join('.'));
}

describe('D&D 5e manual bonuses', () => {
  it.each([
    ['initiativeBonus', 9999],
    ['initiativeBonus', MAX_BONUS_OVERRIDE + 1],
    ['initiativeBonus', MIN_BONUS_OVERRIDE - 1],
    ['passivePerceptionBonus', MAX_BONUS_OVERRIDE + 1],
    ['passivePerceptionBonus', MIN_BONUS_OVERRIDE - 1],
  ])('refuses %s of %d', (field, value) => {
    expect(issuePaths(sheet({ [field]: value }))).toContain(field);
  });

  it.each([
    ['spellSaveDCOtherBonus', MAX_BONUS_OVERRIDE + 1],
    ['spellAttackOtherBonus', MIN_BONUS_OVERRIDE - 1],
  ])('refuses spellcasting.%s of %d', (field, value) => {
    expect(issuePaths(sheet({}, { [field]: value }))).toContain(`spellcasting.${field}`);
  });

  it('accepts every bonus at the ends of the range', () => {
    expect(
      issuePaths(
        sheet(
          { initiativeBonus: MAX_BONUS_OVERRIDE, passivePerceptionBonus: MIN_BONUS_OVERRIDE },
          { spellSaveDCOtherBonus: MIN_BONUS_OVERRIDE, spellAttackOtherBonus: MAX_BONUS_OVERRIDE }
        )
      )
    ).toEqual([]);
  });
});
