import { describe, it, expect } from 'vitest';
import { withinMapLimits, feetPerSquareWithinLimits } from '../mapSize';

describe('withinMapLimits', () => {
  it('keeps a detected grid that is already within the limits', () => {
    expect(withinMapLimits({ width: 30, height: 20, gridSize: 70 })).toEqual({ width: 30, height: 20, gridSize: 70 });
  });

  it('brings a detected grid the server would refuse within the limits', () => {
    // Detection reports squares up to 600 px, and a huge picture more than 500 of them.
    expect(withinMapLimits({ width: 640, height: 2, gridSize: 600 })).toEqual({ width: 500, height: 2, gridSize: 500 });
    expect(withinMapLimits({ width: 0, height: 3, gridSize: 5 })).toEqual({ width: 1, height: 3, gridSize: 10 });
  });
});

describe('feetPerSquareWithinLimits', () => {
  it.each([['5', 5], ['0', 1], ['250', 100], ['', 1]])('reads %j as %s', (raw, expected) => {
    expect(feetPerSquareWithinLimits(raw)).toBe(expected);
  });
});
