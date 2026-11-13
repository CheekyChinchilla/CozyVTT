/**
 * Putting a UVTT's refusal into words.
 *
 * Before importing, the server may want an answer about two things: walls that
 * fall outside the file's own picture, and walls it carries for its furniture.
 * These read that reply and turn it into what the GM sees, so the counts stay
 * accurate, the zeroes stay out of it, and the dialog asks about whichever of
 * the two actually applies.
 */

import { describe, it, expect } from 'vitest';
import {
  uvttImportDecision,
  describeOutOfBounds,
  uvttImportMessage,
  uvttImportTitle,
  hasOutOfBounds,
} from '../uvttImport';

/** An axios-shaped rejection carrying the server's 409 body. */
const refusal = (outOfBounds: unknown, objectWalls = 0) => ({
  response: {
    status: 409,
    data: { code: 'UVTT_IMPORT_NEEDS_CONFIRMATION', outOfBounds, objectWalls },
  },
});

describe('uvttImportDecision', () => {
  it('reads the counts off the refusal', () => {
    expect(uvttImportDecision(refusal({ walls: 79, doors: 20, lights: 0 }))).toEqual({
      outOfBounds: { walls: 79, doors: 20, lights: 0 },
      objectWalls: 0,
    });
  });

  it('reads furniture walls on their own, with nothing out of bounds', () => {
    expect(uvttImportDecision(refusal({ walls: 0, doors: 0, lights: 0 }, 12))).toEqual({
      outOfBounds: { walls: 0, doors: 0, lights: 0 },
      objectWalls: 12,
    });
  });

  it('treats missing and negative numbers as none', () => {
    expect(uvttImportDecision(refusal({ walls: 4, doors: -1 }))).toEqual({
      outOfBounds: { walls: 4, doors: 0, lights: 0 },
      objectWalls: 0,
    });
  });

  it.each([
    ['nothing at all', undefined],
    ['a plain error', new Error('boom')],
    ['a response with no body', { response: {} }],
    ['a body with no counts', { response: { data: { code: 'X' } } }],
    ['counts that are all zero', refusal({ walls: 0, doors: 0, lights: 0 })],
    ['counts that are not numbers', refusal({ walls: 'lots' })],
  ])('answers undefined for %s, so the caller can fall back', (_label, err) => {
    expect(uvttImportDecision(err)).toBeUndefined();
  });
});

describe('what the dialog asks', () => {
  const outOfBoundsOnly = { outOfBounds: { walls: 79, doors: 20, lights: 0 }, objectWalls: 0 };
  const furnitureOnly = { outOfBounds: { walls: 0, doors: 0, lights: 0 }, objectWalls: 12 };
  const both = { outOfBounds: { walls: 4, doors: 0, lights: 0 }, objectWalls: 12 };

  it('leads with the picture problem when there is one', () => {
    expect(uvttImportTitle(outOfBoundsOnly)).toMatch(/outside this map's picture/);
    expect(uvttImportMessage(outOfBoundsOnly)).toContain('79 walls and 20 doors');
    expect(uvttImportMessage(outOfBoundsOnly)).toContain('imports normally');
  });

  it('asks only about the furniture when the picture is fine', () => {
    expect(uvttImportTitle(furnitureOnly)).toMatch(/furniture/i);
    const message = uvttImportMessage(furnitureOnly);
    expect(message).toContain('12 walls for its furniture');
    // Nothing about cropping, because nothing was cropped.
    expect(message).not.toMatch(/outside its map picture/);
  });

  it('covers both when both apply', () => {
    const message = uvttImportMessage(both);
    expect(message).toContain('4 walls in this file sit outside');
    expect(message).toContain('12 walls for its furniture');
  });

  it('says whether the picture is the problem', () => {
    expect(hasOutOfBounds(outOfBoundsOnly.outOfBounds)).toBe(true);
    expect(hasOutOfBounds(furnitureOnly.outOfBounds)).toBe(false);
  });

  it('still asks when the counts did not come through', () => {
    expect(uvttImportMessage(undefined)).toMatch(/Import it anyway\?$/);
  });
});

describe('describeOutOfBounds', () => {
  it.each([
    [{ walls: 79, doors: 20, lights: 0 }, '79 walls and 20 doors'],
    [{ walls: 4, doors: 0, lights: 0 }, '4 walls'],
    [{ walls: 0, doors: 0, lights: 3 }, '3 lights'],
    [{ walls: 12, doors: 2, lights: 1 }, '12 walls, 2 doors and 1 light'],
  ])('%o reads as "%s"', (counts, expected) => {
    expect(describeOutOfBounds(counts)).toBe(expected);
  });

  it('says one wall, not 1 walls', () => {
    expect(describeOutOfBounds({ walls: 1, doors: 1, lights: 1 })).toBe('1 wall, 1 door and 1 light');
  });
});
