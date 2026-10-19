/**
 * A Call of Cthulhu investigator whose CON and SIZ add up to under 10 is
 * stored.
 *
 * Hit points are CON plus SIZ divided by ten, rounded down, so such an
 * investigator has 0, and the schema held the maximum and the major wound
 * threshold to at least 1. Rolled characteristics never get there; typed ones
 * can, and the whole save was refused.
 */
import { describe, it, expect } from '@jest/globals';
import { GameSystem } from '../../../game-systems';
import { getBlankCharacterTemplate, validateCharacterData } from '../index';

type Sheet = Record<string, Record<string, Record<string, unknown>>>;
const blank = () => getBlankCharacterTemplate(GameSystem.CALL_OF_CTHULHU_7E) as unknown as Sheet;

function withHitPoints(hp: Record<string, unknown>) {
  const sheet = blank();
  sheet.derivedStats = { ...sheet.derivedStats, hp: { ...sheet.derivedStats.hp, ...hp } };
  return sheet;
}

describe('Call of Cthulhu hit points under 1', () => {
  it('stores a maximum of 0 hit points', () => {
    const sheet = withHitPoints({ maximum: 0, current: 0, majorWoundThreshold: 1 });
    expect(validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, sheet).success).toBe(true);
  });

  it('stores a major wound threshold of 0', () => {
    const sheet = withHitPoints({ maximum: 0, current: 0, majorWoundThreshold: 0 });
    expect(validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, sheet).success).toBe(true);
  });

  it('still refuses a negative maximum or threshold', () => {
    expect(validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, withHitPoints({ maximum: -1 })).success).toBe(false);
    expect(
      validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, withHitPoints({ majorWoundThreshold: -1 })).success
    ).toBe(false);
  });
});
