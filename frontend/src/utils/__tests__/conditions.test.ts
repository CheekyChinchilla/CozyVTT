/**
 * Condition badge abbreviations.
 *
 * The map used to draw a condition's first letter, which cannot separate
 * Paralyzed, Poisoned, Petrified and Prone — nor Incapacitated from Invisible.
 * The whole point of the table is that no two conditions share a code, so that
 * is what these assert; a collision would silently restore the original bug.
 */

import { describe, it, expect } from 'vitest';
import {
  CONDITION_ABBREVIATIONS,
  HORROR_D100_CONDITIONS,
  FIFTH_EDITION_CONDITIONS,
  FIFTH_EDITION_EFFECTS,
  MAX_CONDITION_BADGES,
  conditionAbbreviation,
  conditionKey,
  conditionsOffered,
  effectsOffered,
} from '../conditions';
import { GameSystem } from '@/types/gameSystem';

describe('condition abbreviations', () => {
  it('gives every condition a distinct code', () => {
    const codes = [...CONDITION_ABBREVIATIONS.values()];
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('separates the conditions a single initial could not', () => {
    // The five that collided on "P" and "I" in the original.
    const collided = ['Paralyzed', 'Poisoned', 'Petrified', 'Prone', 'Incapacitated', 'Invisible'];
    const codes = collided.map(conditionAbbreviation);
    expect(new Set(codes).size).toBe(collided.length);
  });

  // These two used to hand-copy the lists out of the editors, which is how the
  // divergence they were meant to catch got through: the token editor's twelve
  // are a subset of the sheet's fifteen, so "every offered condition has a code"
  // held for both while the editors disagreed with each other. They now compare
  // against the one exported list instead.

  it('has a code for every listed condition and effect, and no codes for anything else', () => {
    const names = [...FIFTH_EDITION_CONDITIONS, ...FIFTH_EDITION_EFFECTS, ...HORROR_D100_CONDITIONS.map((c) => c.label)];
    const listed = [...new Set(names.map((c) => c.toLowerCase()))].sort();
    const coded = [...CONDITION_ABBREVIATIONS.keys()].sort();
    expect(coded).toEqual(listed);
  });

  it('lists 5E\'s conditions in 5E, Horror d100\'s in Horror d100, and none elsewhere', () => {
    expect(conditionsOffered(GameSystem.FIFTH_EDITION)).toBe(FIFTH_EDITION_CONDITIONS);
    expect(conditionsOffered(GameSystem.HORROR_D100)).toEqual([
      'Major Wound', 'Dying', 'Unconscious', 'Temporary Insanity',
    ]);
    expect(conditionsOffered(GameSystem.FANTASY_D20)).toEqual([]);
    expect(conditionsOffered(null)).toEqual([]);
  });

  it('offers the complete set of 5e conditions', () => {
    // SRD 5.1, "Appendix PH-A: Conditions". Spelled out rather than derived, so
    // that dropping one from the export fails here instead of silently narrowing
    // what a GM can apply — which is exactly what happened to Deafened, Grappled
    // and Petrified.
    expect([...FIFTH_EDITION_CONDITIONS].sort()).toEqual([
      'Blinded', 'Charmed', 'Deafened', 'Exhausted', 'Frightened', 'Grappled',
      'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned',
      'Prone', 'Restrained', 'Stunned', 'Unconscious',
    ].sort());
  });

  it('offers the 5E effects a table tracks beside the conditions, and none of the conditions among them', () => {
    // Spelled out for the same reason as the conditions above. Each comes
    // from a spell, a feature or an action in the SRD 5.1.
    expect([...FIFTH_EDITION_EFFECTS]).toEqual([
      'Baned', 'Blessed', 'Concentrating', 'Dodging', 'Hasted', "Hunter's Mark", 'Raging', 'Slowed',
    ]);
    const conditions = new Set(FIFTH_EDITION_CONDITIONS.map((c) => c.toLowerCase()));
    expect(FIFTH_EDITION_EFFECTS.filter((e) => conditions.has(e.toLowerCase()))).toEqual([]);
  });

  it('gives each effect a code of its own, apart from every condition\'s', () => {
    const effectCodes = FIFTH_EDITION_EFFECTS.map(conditionAbbreviation);
    expect(new Set(effectCodes).size).toBe(FIFTH_EDITION_EFFECTS.length);
    const conditionCodes = new Set([...FIFTH_EDITION_CONDITIONS, ...HORROR_D100_CONDITIONS.map((c) => c.label)].map(conditionAbbreviation));
    expect(effectCodes.filter((code) => conditionCodes.has(code))).toEqual([]);
  });

  it('lists the effects in 5E only', () => {
    expect(effectsOffered(GameSystem.FIFTH_EDITION)).toBe(FIFTH_EDITION_EFFECTS);
    expect(effectsOffered(GameSystem.HORROR_D100)).toEqual([]);
    expect(effectsOffered(GameSystem.FANTASY_D20)).toEqual([]);
    expect(effectsOffered(null)).toEqual([]);
  });

  it('knows a name by one key, whatever its capitals, spaces or apostrophe', () => {
    // iOS and iPadOS type a curly apostrophe; some keyboards a modifier letter.
    for (const typed of ["Hunter's Mark", 'hunter\u2019s mark', '  HUNTER\u2018S MARK ', 'Hunter\u02BCs Mark']) {
      expect(conditionKey(typed)).toBe("hunter's mark");
    }
  });

  // Hexed was listed until 1.7.0. A token that carries it shows it as one
  // of the GM's own.
  it('gives an effect the list no longer offers the first two letters, as any of the GM\'s own', () => {
    expect(conditionAbbreviation('Hexed')).toBe('HE');
  });

  it('gives a listed effect its badge however its name is typed', () => {
    expect(conditionAbbreviation('Hunter\u2019s Mark')).toBe('HM');
    expect(conditionAbbreviation('HUNTER\u2019S MARK')).toBe('HM');
    expect(conditionAbbreviation('hasted')).toBe('HA');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(conditionAbbreviation('poisoned')).toBe('PO');
    expect(conditionAbbreviation('POISONED')).toBe('PO');
    expect(conditionAbbreviation('  Poisoned ')).toBe('PO');
  });

  it('falls back to two letters for a homebrew condition', () => {
    expect(conditionAbbreviation('Cursed')).toBe('CU');
    expect(conditionAbbreviation('marked')).toBe('MA');
  });

  it('gives a condition named like a property every object has its own two letters', () => {
    // The table was read as a plain object, so "constructor" found Object
    // itself and the badge drew a function's text.
    for (const name of ['constructor', 'Constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const badge = conditionAbbreviation(name);
      expect(typeof badge).toBe('string');
      expect(badge).toBe(name.slice(0, 2).toUpperCase());
    }
  });

  it('does not throw on empty input', () => {
    expect(conditionAbbreviation('')).toBe('?');
  });

  it('always returns at most two characters', () => {
    const samples = [...CONDITION_ABBREVIATIONS.keys(), 'Cursed', 'X', 'Something Long'];
    for (const s of samples) {
      expect(conditionAbbreviation(s).length).toBeLessThanOrEqual(2);
    }
  });

  it('keeps the badge row short enough to sit above a token', () => {
    expect(MAX_CONDITION_BADGES).toBeGreaterThan(0);
    expect(MAX_CONDITION_BADGES).toBeLessThanOrEqual(5);
  });
});
