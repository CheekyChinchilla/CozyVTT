/**
 * Which way a token faces: whole degrees from 0 to 359, turned in steps.
 */

import { describe, it, expect } from 'vitest';
import { ROTATION_STEP, facing, turned } from '../tokenRotation';

describe('facing', () => {
  it('keeps whole degrees from 0 to 359', () => {
    expect(facing(90)).toBe(90);
    expect(facing(0)).toBe(0);
    expect(facing(359)).toBe(359);
  });

  it('wraps a full turn and more back into that range', () => {
    expect(facing(360)).toBe(0);
    expect(facing(405)).toBe(45);
    expect(facing(-45)).toBe(315);
  });

  it('rounds to a whole degree, and reads anything else as facing up', () => {
    expect(facing(44.6)).toBe(45);
    expect(facing(undefined)).toBe(0);
    expect(facing(Number.NaN)).toBe(0);
  });
});

describe('turned', () => {
  it('turns by one step either way, through north', () => {
    expect(ROTATION_STEP).toBe(45);
    expect(turned(0, ROTATION_STEP)).toBe(45);
    expect(turned(0, -ROTATION_STEP)).toBe(315);
    expect(turned(315, ROTATION_STEP)).toBe(0);
    expect(turned(undefined, ROTATION_STEP)).toBe(45);
  });
});
