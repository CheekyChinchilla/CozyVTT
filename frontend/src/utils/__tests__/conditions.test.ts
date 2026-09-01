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
  DND5E_CONDITIONS,
  MAX_CONDITION_BADGES,
  conditionAbbreviation,
} from '../conditions';

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

  it('has a code for every condition, and no codes for anything else', () => {
    const listed = DND5E_CONDITIONS.map((c) => c.toLowerCase()).sort();
    const coded = Object.keys(CONDITION_ABBREVIATIONS).sort();
    expect(coded).toEqual(listed);
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
