/**
 * Reading hit points off a character sheet.
 *
 * Each system stores HP somewhere different, and this is the one place that
 * knows where. It is read on the server to build the campaign roster and to
 * decide whether a sheet save is worth broadcasting, and on the client to draw
 * the roster cards and the HP bars on map tokens — so the two copies are pinned
 * byte-for-byte at the bottom of this file.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { extractCharacterHp, sameCharacterHp } from '../characterHp';
import { RETIRED_GAME_SYSTEM } from '../../__tests__/helpers/retiredGameSystem';

const OLD_HORROR_D100_SHEET: unknown = JSON.parse(
  readFileSync(path.join(__dirname, '../../legacy/__fixtures__/horror-d100-sheets/v1.6.0-detective-played.json'), 'utf8')
);

describe('extractCharacterHp', () => {
  it('reads top-level hp for 5E', () => {
    expect(
      extractCharacterHp('FIFTH_EDITION', { hp: { maximum: 27, current: 11, temporary: 4 } })
    ).toEqual({ current: 11, max: 27, temp: 4 });
  });

  it('reads top-level hp for Fantasy d20', () => {
    expect(
      extractCharacterHp('FANTASY_D20', { hp: { maximum: 20, current: 20, temporary: 0 } })
    ).toEqual({ current: 20, max: 20, temp: 0 });
  });

  // Horror d100 keeps hit points in their own block and has no temporary
  // hit points — a sheet carrying them anyway must not report them.
  it('reads hitPoints for Horror d100, ignoring temporary', () => {
    expect(
      extractCharacterHp('HORROR_D100', {
        hitPoints: { maximum: 12, current: 9, temporary: 3 },
      })
    ).toEqual({ current: 9, max: 12, temp: 0 });
  });

  // Hit points below 0 are something the open d100 rules track.
  it('reads Horror d100 hit points below 0 as they are', () => {
    expect(extractCharacterHp('HORROR_D100', { hitPoints: { maximum: 12, current: -2 } })).toEqual({ current: -2, max: 12, temp: 0 });
  });

  it('falls back to full when current is missing', () => {
    expect(extractCharacterHp('FIFTH_EDITION', { hp: { maximum: 27 } })).toEqual({
      current: 27,
      max: 27,
      temp: 0,
    });
  });

  it.each([
    ['no data', 'FIFTH_EDITION', null],
    ['no game system', null, { hp: { maximum: 10, current: 10, temporary: 0 } }],
    ['a system CozyVTT no longer supports', RETIRED_GAME_SYSTEM, { hp: { maximum: 10, current: 10, temporary: 0 } }],
    ['a system it never had', 'SOMETHING_ELSE', { hp: { maximum: 10, current: 10, temporary: 0 } }],
    ['no hp block', 'FIFTH_EDITION', {}],
    ['hp that is not an object', 'FIFTH_EDITION', { hp: 27 }],
    // An unfilled sheet stores zero, and a bar drawn against a maximum of zero
    // is meaningless — that is what separates "has HP" from "has the field".
    ['a maximum of zero', 'FIFTH_EDITION', { hp: { maximum: 0, current: 0, temporary: 0 } }],
    ['a negative maximum', 'FIFTH_EDITION', { hp: { maximum: -5, current: 0, temporary: 0 } }],
    ['a non-numeric maximum', 'FIFTH_EDITION', { hp: { maximum: '27', current: 27, temporary: 0 } }],
    // NaN fails every comparison, so a `<= 0` guard would let it through and
    // return a bar with a NaN maximum.
    ['a NaN maximum', 'FIFTH_EDITION', { hp: { maximum: NaN, current: 5, temporary: 0 } }],
    ['5e data with Horror d100 placement', 'FIFTH_EDITION', { hitPoints: { maximum: 12 } }],
    // The sheet before 1.7.0 kept hit points elsewhere; the server converts
    // such a sheet before it is read (legacy/sheetConversion.ts).
    ['a Horror d100 sheet still in the shape before 1.7.0', 'HORROR_D100', OLD_HORROR_D100_SHEET],
  ])('returns null for %s', (_label, system, data) => {
    expect(extractCharacterHp(system as string | null, data as Record<string, unknown> | null)).toBeNull();
  });
});

describe('sameCharacterHp', () => {
  const hp = { current: 11, max: 27, temp: 0 };

  it('is true for equal readings', () => {
    expect(sameCharacterHp(hp, { ...hp })).toBe(true);
  });

  it('is true for two absent readings', () => {
    expect(sameCharacterHp(null, null)).toBe(true);
  });

  it.each([
    ['current', { ...hp, current: 12 }],
    ['max', { ...hp, max: 34 }],
    ['temp', { ...hp, temp: 5 }],
  ])('is false when %s differs', (_label, other) => {
    expect(sameCharacterHp(hp, other)).toBe(false);
  });

  it('is false when one side is absent', () => {
    expect(sameCharacterHp(hp, null)).toBe(false);
    expect(sameCharacterHp(null, hp)).toBe(false);
  });
});

describe('parity with the frontend copy', () => {
  // The server decides what HP to broadcast; the client decides what to draw.
  // Drift here would put one number on the roster and another on the map.
  it('is byte-for-byte identical to frontend/src/utils/characterHp.ts', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../characterHp.ts'), 'utf8');
    const frontendCopy = readFileSync(
      path.resolve(__dirname, '../../../../frontend/src/utils/characterHp.ts'),
      'utf8'
    );
    expect(backendCopy).toBe(frontendCopy);
  });
});
