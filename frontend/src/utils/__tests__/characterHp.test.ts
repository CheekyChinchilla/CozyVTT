import { describe, it, expect } from 'vitest';
import { extractCharacterHp } from '../characterHp';

// ============================================
// extractCharacterHp
// ============================================

describe('extractCharacterHp', () => {
  it('returns null when data is null', () => {
    expect(extractCharacterHp('FIFTH_EDITION', null)).toBeNull();
  });

  it('returns null when data is undefined', () => {
    expect(extractCharacterHp('FIFTH_EDITION', undefined)).toBeNull();
  });

  it('returns null when gameSystem is null', () => {
    expect(extractCharacterHp(null, { hp: { maximum: 30, current: 20 } })).toBeNull();
  });

  it('returns null for an unknown game system', () => {
    expect(extractCharacterHp('UNKNOWN_SYSTEM', { hp: { maximum: 30, current: 20 } })).toBeNull();
  });

  // ---- FIFTH_EDITION ----

  describe('FIFTH_EDITION', () => {
    it('extracts hp with current and temp', () => {
      const result = extractCharacterHp('FIFTH_EDITION', {
        hp: { maximum: 30, current: 18, temporary: 5 },
      });
      expect(result).toEqual({ current: 18, max: 30, temp: 5 });
    });

    it('defaults current to maximum when current is missing', () => {
      const result = extractCharacterHp('FIFTH_EDITION', { hp: { maximum: 30 } });
      expect(result).toEqual({ current: 30, max: 30, temp: 0 });
    });

    it('defaults temp to 0 when temporary is missing', () => {
      const result = extractCharacterHp('FIFTH_EDITION', { hp: { maximum: 30, current: 20 } });
      expect(result!.temp).toBe(0);
    });

    it('returns null when maximum is 0', () => {
      expect(extractCharacterHp('FIFTH_EDITION', { hp: { maximum: 0, current: 0 } })).toBeNull();
    });

    it('returns null when hp is absent', () => {
      expect(extractCharacterHp('FIFTH_EDITION', {})).toBeNull();
    });
  });

  // ---- FANTASY_D20 ----

  describe('FANTASY_D20', () => {
    it('extracts hp identically to FIFTH_EDITION', () => {
      const result = extractCharacterHp('FANTASY_D20', {
        hp: { maximum: 40, current: 35, temporary: 2 },
      });
      expect(result).toEqual({ current: 35, max: 40, temp: 2 });
    });
  });

  // ---- FLEXIBLE ----

  // A Flexible character has no game system (null, above). 'FLEXIBLE' is no
  // system code, so it reads no hit points, as any unknown code does.
  describe('FLEXIBLE', () => {
    it('is not a game system, so no hit points are read', () => {
      expect(extractCharacterHp('FLEXIBLE', { hp: { maximum: 20, current: 15 } })).toBeNull();
    });
  });

  // ---- HORROR_D100 ----

  describe('HORROR_D100', () => {
    it('extracts hp from hitPoints', () => {
      const result = extractCharacterHp('HORROR_D100', {
        hitPoints: { maximum: 12, current: 8 },
      });
      expect(result).toEqual({ current: 8, max: 12, temp: 0 });
    });

    it('always returns temp: 0', () => {
      const result = extractCharacterHp('HORROR_D100', {
        hitPoints: { maximum: 12, current: 10 },
      });
      expect(result!.temp).toBe(0);
    });

    it('defaults current to maximum when missing', () => {
      const result = extractCharacterHp('HORROR_D100', {
        hitPoints: { maximum: 12 },
      });
      expect(result).toEqual({ current: 12, max: 12, temp: 0 });
    });

    it('returns null when hitPoints is absent', () => {
      expect(extractCharacterHp('HORROR_D100', {})).toBeNull();
    });

    it('returns null when hp.maximum is 0', () => {
      expect(
        extractCharacterHp('HORROR_D100', {
          hitPoints: { maximum: 0, current: 0 },
        })
      ).toBeNull();
    });
  });

  // NaN fails every comparison, so `max <= 0` does not reject it the way
  // `max > 0` accepted only real numbers. Caught by review when the per-system
  // branches were collapsed into one reader; without this the sheet would draw
  // a bar against a NaN maximum.
  it('rejects a NaN maximum rather than returning a NaN bar', () => {
    expect(extractCharacterHp('FIFTH_EDITION', { hp: { maximum: NaN, current: 5 } })).toBeNull();
    expect(
      extractCharacterHp('HORROR_D100', { hitPoints: { maximum: NaN } })
    ).toBeNull();
  });
});
