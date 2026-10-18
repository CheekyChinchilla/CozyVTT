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
  COC7E_CONDITIONS,
  DND5E_CONDITIONS,
  MAX_CONDITION_BADGES,
  conditionAbbreviation,
  conditionsOffered,
} from '../conditions';
import { GameSystem } from '@/types/gameSystem';

describe('condition abbreviations', () => {
  it('gives every condition a distinct code', () => {
    const codes = Object.values(CONDITION_ABBREVIATIONS);
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

  it('has a code for every listed condition, and no codes for anything else', () => {
    const names = [...DND5E_CONDITIONS, ...COC7E_CONDITIONS.map((c) => c.label)];
    const listed = [...new Set(names.map((c) => c.toLowerCase()))].sort();
    const coded = Object.keys(CONDITION_ABBREVIATIONS).sort();
    expect(coded).toEqual(listed);
  });

  it('lists D&D 5e\'s conditions in D&D 5e, Call of Cthulhu\'s in Call of Cthulhu, and none elsewhere', () => {
    expect(conditionsOffered(GameSystem.DND_5E)).toBe(DND5E_CONDITIONS);
    expect(conditionsOffered(GameSystem.CALL_OF_CTHULHU_7E)).toEqual([
      'Major Wound', 'Dying', 'Unconscious', 'Temporary Insanity', 'Indefinite Insanity',
    ]);
    expect(conditionsOffered(GameSystem.PATHFINDER_2E)).toEqual([]);
    expect(conditionsOffered(GameSystem.SHADOWRUN_6E)).toEqual([]);
    expect(conditionsOffered(null)).toEqual([]);
  });

  it('offers the complete set of 5e conditions', () => {
    // Basic Rules, Appendix A. Spelled out rather than derived, so that dropping
    // one from the export fails here instead of silently narrowing what a DM can
    // apply — which is exactly what happened to Deafened, Grappled and Petrified.
    expect([...DND5E_CONDITIONS].sort()).toEqual([
      'Blinded', 'Charmed', 'Deafened', 'Exhausted', 'Frightened', 'Grappled',
      'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned',
      'Prone', 'Restrained', 'Stunned', 'Unconscious',
    ].sort());
  });

  it('is case- and whitespace-insensitive', () => {
    expect(conditionAbbreviation('poisoned')).toBe('PO');
    expect(conditionAbbreviation('POISONED')).toBe('PO');
    expect(conditionAbbreviation('  Poisoned ')).toBe('PO');
  });

  it('falls back to two letters for a homebrew condition', () => {
    expect(conditionAbbreviation('Cursed')).toBe('CU');
    expect(conditionAbbreviation('slowed')).toBe('SL');
  });

  it('does not throw on empty input', () => {
    expect(conditionAbbreviation('')).toBe('?');
  });

  it('always returns at most two characters', () => {
    const samples = [...Object.keys(CONDITION_ABBREVIATIONS), 'Cursed', 'X', 'Something Long'];
    for (const s of samples) {
      expect(conditionAbbreviation(s).length).toBeLessThanOrEqual(2);
    }
  });

  it('keeps the badge row short enough to sit above a token', () => {
    expect(MAX_CONDITION_BADGES).toBeGreaterThan(0);
    expect(MAX_CONDITION_BADGES).toBeLessThanOrEqual(5);
  });
});
