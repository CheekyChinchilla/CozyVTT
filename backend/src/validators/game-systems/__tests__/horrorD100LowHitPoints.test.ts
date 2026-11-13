/**
 * A Horror d100 character whose hit points are low or gone is stored.
 *
 * Typed characteristics can give a maximum of 0 hit points, and a character
 * that takes more damage than it has goes below 0, which the open d100 rules
 * track (p. 14, Hit Points). Neither may refuse the whole save.
 */
import { describe, it, expect } from '@jest/globals';
import { GameSystem } from '../../../game-systems';
import { getBlankCharacterTemplate, validateCharacterData } from '../index';

const withHitPoints = (hitPoints: Record<string, unknown>) => ({
  ...getBlankCharacterTemplate(GameSystem.HORROR_D100),
  hitPoints,
});

describe('Horror d100 hit points under 1', () => {
  it('stores a maximum of 0 hit points', () => {
    expect(validateCharacterData(GameSystem.HORROR_D100, withHitPoints({ maximum: 0, current: 0 })).success).toBe(true);
  });

  it('stores current hit points below 0', () => {
    expect(validateCharacterData(GameSystem.HORROR_D100, withHitPoints({ maximum: 12, current: -3 })).success).toBe(true);
  });

  it('still refuses a negative maximum', () => {
    expect(validateCharacterData(GameSystem.HORROR_D100, withHitPoints({ maximum: -1, current: 0 })).success).toBe(false);
  });
});
