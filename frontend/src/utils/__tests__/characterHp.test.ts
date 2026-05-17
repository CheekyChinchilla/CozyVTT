import { describe, it, expect } from 'vitest';
import { extractCharacterHp } from '../characterHp';

// ============================================
// extractCharacterHp
// ============================================

describe('extractCharacterHp', () => {
  it('returns null when data is null', () => {
    expect(extractCharacterHp('DND_5E', null)).toBeNull();
  });

  it('returns null when data is undefined', () => {
    expect(extractCharacterHp('DND_5E', undefined)).toBeNull();
  });

  it('returns null when gameSystem is null', () => {
    expect(extractCharacterHp(null, { hp: { maximum: 30, current: 20 } })).toBeNull();
  });

  it('returns null for an unknown game system', () => {
    expect(extractCharacterHp('UNKNOWN_SYSTEM', { hp: { maximum: 30, current: 20 } })).toBeNull();
  });

  // ---- DND_5E ----

  describe('DND_5E', () => {
    it('extracts hp with current and temp', () => {
      const result = extractCharacterHp('DND_5E', {
        hp: { maximum: 30, current: 18, temporary: 5 },
      });
      expect(result).toEqual({ current: 18, max: 30, temp: 5 });
    });

    it('defaults current to maximum when current is missing', () => {
      const result = extractCharacterHp('DND_5E', { hp: { maximum: 30 } });
      expect(result).toEqual({ current: 30, max: 30, temp: 0 });
    });

    it('defaults temp to 0 when temporary is missing', () => {
      const result = extractCharacterHp('DND_5E', { hp: { maximum: 30, current: 20 } });
      expect(result!.temp).toBe(0);
    });

    it('returns null when maximum is 0', () => {
      expect(extractCharacterHp('DND_5E', { hp: { maximum: 0, current: 0 } })).toBeNull();
    });

    it('returns null when hp is absent', () => {
      expect(extractCharacterHp('DND_5E', {})).toBeNull();
    });
  });

  // ---- PATHFINDER_2E ----

  describe('PATHFINDER_2E', () => {
    it('extracts hp identically to DND_5E', () => {
      const result = extractCharacterHp('PATHFINDER_2E', {
        hp: { maximum: 40, current: 35, temporary: 2 },
      });
      expect(result).toEqual({ current: 35, max: 40, temp: 2 });
    });
  });

  // ---- FLEXIBLE ----

  describe('FLEXIBLE', () => {
    it('extracts hp identically to DND_5E', () => {
      const result = extractCharacterHp('FLEXIBLE', {
        hp: { maximum: 20, current: 15 },
      });
      expect(result).toEqual({ current: 15, max: 20, temp: 0 });
    });
  });

  // ---- CALL_OF_CTHULHU_7E ----

  describe('CALL_OF_CTHULHU_7E', () => {
    it('extracts hp from derivedStats.hp', () => {
      const result = extractCharacterHp('CALL_OF_CTHULHU_7E', {
        derivedStats: { hp: { maximum: 12, current: 8 } },
      });
      expect(result).toEqual({ current: 8, max: 12, temp: 0 });
    });

    it('always returns temp: 0', () => {
      const result = extractCharacterHp('CALL_OF_CTHULHU_7E', {
        derivedStats: { hp: { maximum: 12, current: 10 } },
      });
      expect(result!.temp).toBe(0);
    });

    it('defaults current to maximum when missing', () => {
      const result = extractCharacterHp('CALL_OF_CTHULHU_7E', {
        derivedStats: { hp: { maximum: 12 } },
      });
      expect(result).toEqual({ current: 12, max: 12, temp: 0 });
    });

    it('returns null when derivedStats is absent', () => {
      expect(extractCharacterHp('CALL_OF_CTHULHU_7E', {})).toBeNull();
    });

    it('returns null when hp.maximum is 0', () => {
      expect(
        extractCharacterHp('CALL_OF_CTHULHU_7E', {
          derivedStats: { hp: { maximum: 0, current: 0 } },
        })
      ).toBeNull();
    });
  });
});
