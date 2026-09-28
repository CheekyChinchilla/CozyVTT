import { describe, it, expect } from 'vitest';
import { TokenDisposition } from '@/types';
import { withKnownDisposition } from '../creatureDisposition';

describe('withKnownDisposition', () => {
  it.each([TokenDisposition.FRIENDLY, TokenDisposition.NEUTRAL, TokenDisposition.HOSTILE])('keeps %s as it is', (d) => {
    const creature = { id: 'c', disposition: d };
    expect(withKnownDisposition(creature)).toBe(creature);
  });

  it.each(['Hostile', 'evil', '', null])('reads a stored %p as hostile', (stored) => {
    const creature = { id: 'c', disposition: stored as unknown as TokenDisposition };
    expect(withKnownDisposition(creature)).toEqual({ id: 'c', disposition: TokenDisposition.HOSTILE });
  });
});
