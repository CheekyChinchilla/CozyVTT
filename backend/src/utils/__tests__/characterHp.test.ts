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

describe('extractCharacterHp', () => {
  it('reads top-level hp for D&D 5e', () => {
    expect(
      extractCharacterHp('DND_5E', { hp: { maximum: 27, current: 11, temporary: 4 } })
    ).toEqual({ current: 11, max: 27, temp: 4 });
  });

  it('reads top-level hp for Pathfinder 2e', () => {
    expect(
      extractCharacterHp('PATHFINDER_2E', { hp: { maximum: 20, current: 20, temporary: 0 } })
    ).toEqual({ current: 20, max: 20, temp: 0 });
  });

  // Call of Cthulhu keeps hit points under derived stats and has no temporary
  // hit points — a sheet carrying them anyway must not report them.
  it('reads derivedStats.hp for Call of Cthulhu, ignoring temporary', () => {
    expect(
      extractCharacterHp('CALL_OF_CTHULHU_7E', {
        derivedStats: { hp: { maximum: 12, current: 9, temporary: 3 } },
      })
    ).toEqual({ current: 9, max: 12, temp: 0 });
  });

  it('falls back to full when current is missing', () => {
    expect(extractCharacterHp('DND_5E', { hp: { maximum: 27 } })).toEqual({
      current: 27,
      max: 27,
      temp: 0,
    });
  });

  it.each([
    ['no data', 'DND_5E', null],
    ['no game system', null, { hp: { maximum: 10, current: 10, temporary: 0 } }],
    ['an unknown system', 'SHADOWRUN_6E', { hp: { maximum: 10, current: 10, temporary: 0 } }],
    ['no hp block', 'DND_5E', {}],
    ['hp that is not an object', 'DND_5E', { hp: 27 }],
    // An unfilled sheet stores zero, and a bar drawn against a maximum of zero
    // is meaningless — that is what separates "has HP" from "has the field".
    ['a maximum of zero', 'DND_5E', { hp: { maximum: 0, current: 0, temporary: 0 } }],
    ['a negative maximum', 'DND_5E', { hp: { maximum: -5, current: 0, temporary: 0 } }],
    ['a non-numeric maximum', 'DND_5E', { hp: { maximum: '27', current: 27, temporary: 0 } }],
    // NaN fails every comparison, so a `<= 0` guard would let it through and
    // return a bar with a NaN maximum.
    ['a NaN maximum', 'DND_5E', { hp: { maximum: NaN, current: 5, temporary: 0 } }],
    ['5e data with CoC placement', 'DND_5E', { derivedStats: { hp: { maximum: 12 } } }],
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
