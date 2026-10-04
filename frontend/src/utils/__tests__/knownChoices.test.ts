import { describe, it, expect } from 'vitest';
import { TokenDisposition, TokenType } from '@/types';
import type { TokenDisplayMode } from '@/types';
import { withKnownCreatureChoices, withKnownTemplateChoices } from '../knownChoices';

const creature = (disposition: unknown, displayMode: unknown) =>
  ({ id: 'c', disposition: disposition as TokenDisposition, displayMode: displayMode as TokenDisplayMode });

describe('withKnownCreatureChoices', () => {
  it.each([TokenDisposition.FRIENDLY, TokenDisposition.NEUTRAL, TokenDisposition.HOSTILE])('keeps %s as it is', (d) => {
    const c = creature(d, 'pog');
    expect(withKnownCreatureChoices(c)).toBe(c);
  });

  it.each(['Hostile', 'evil', '', null])('reads a stored disposition %p as hostile', (stored) => {
    expect(withKnownCreatureChoices(creature(stored, 'pog'))).toEqual(creature(TokenDisposition.HOSTILE, 'pog'));
  });

  // The same for the display mode: a creature imported by an earlier release
  // with one the app does not know was placed with it, and refused.
  it.each(['pog', 'top-down', 'full-art'])('keeps the display mode %s', (mode) => {
    const c = creature(TokenDisposition.NEUTRAL, mode);
    expect(withKnownCreatureChoices(c)).toBe(c);
  });

  it.each(['Pog', 'cutout', '', null])('reads a stored display mode %p as pog', (stored) => {
    expect(withKnownCreatureChoices(creature(TokenDisposition.NEUTRAL, stored))).toEqual(creature(TokenDisposition.NEUTRAL, 'pog'));
  });
});

describe('withKnownTemplateChoices', () => {
  const template = (type: unknown, disposition: unknown, displayMode: unknown) =>
    ({ id: 't', type: type as TokenType, disposition: disposition as TokenDisposition | null, displayMode: displayMode as TokenDisplayMode });

  it('keeps a template whose choices the app knows, no disposition included', () => {
    const t = template(TokenType.NPC, null, 'top-down');
    expect(withKnownTemplateChoices(t)).toBe(t);
  });

  it('reads unknown stored values as the defaults, so the template can be placed', () => {
    expect(withKnownTemplateChoices(template('Monster', 'Hostile', 'Pog'))).toEqual(template(TokenType.OBJECT, null, 'pog'));
  });
});

