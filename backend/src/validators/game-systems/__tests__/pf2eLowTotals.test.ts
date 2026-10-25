/**
 * A Pathfinder 2e sheet whose AC, Class DC or Spell DC works out under 10 is
 * stored.
 *
 * The schema held all three to at least 10, but the rules allow less: a DC is
 * "10 + the total modifier" and a modifier can be negative (Core Rulebook,
 * p. 444 to 445). Dexterity 8 untrained gives AC 9, and the editor works these
 * totals out, so such a character could not be saved at all.
 */
import { describe, it, expect } from '@jest/globals';
import { GameSystem } from '../../../game-systems';
import { getBlankCharacterTemplate, validateCharacterData } from '../index';

const blank = () => getBlankCharacterTemplate(GameSystem.PATHFINDER_2E) as unknown as Record<string, Record<string, unknown>>;

describe('Pathfinder 2e totals under 10', () => {
  it('stores an AC of 9', () => {
    const sheet = blank();
    sheet.armorClass = { ...sheet.armorClass, total: 9 };
    expect(validateCharacterData(GameSystem.PATHFINDER_2E, sheet).success).toBe(true);
  });

  it('stores a Class DC of 9', () => {
    const sheet = blank();
    sheet.classDC = { ...sheet.classDC, total: 9 };
    expect(validateCharacterData(GameSystem.PATHFINDER_2E, sheet).success).toBe(true);
  });

  it('stores a Spell DC of 9', () => {
    const sheet = blank();
    const spellcasting = sheet.spellcasting as Record<string, Record<string, unknown>>;
    sheet.spellcasting = { ...spellcasting, spellDC: { ...spellcasting.spellDC, dc: 9 } };
    expect(validateCharacterData(GameSystem.PATHFINDER_2E, sheet).success).toBe(true);
  });

  it('still takes whole numbers only', () => {
    const sheet = blank();
    sheet.armorClass = { ...sheet.armorClass, total: 9.5 };
    expect(validateCharacterData(GameSystem.PATHFINDER_2E, sheet).success).toBe(false);
  });
});
