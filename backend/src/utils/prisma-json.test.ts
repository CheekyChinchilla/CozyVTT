/**
 * Prisma JSON accessors.
 *
 * These replace 61 `as any` casts at the database boundary, so what matters is
 * that they assert exactly what those casts asserted and nothing more. In
 * particular they must keep loading blobs written by earlier versions of the
 * app: a self-hosted instance upgrading with years of maps cannot have a typing
 * change reject its data.
 */

import { Prisma } from '@prisma/client';

import {
  jsonOrNull,
  readFogState,
  readJsonArray,
  readJsonObject,
  readLights,
  readTokens,
  readWallSegments,
  toJson,
} from './prisma-json';

describe('array columns', () => {
  const readers = [
    ['readTokens', readTokens],
    ['readWallSegments', readWallSegments],
    ['readLights', readLights],
    ['readJsonArray', readJsonArray],
  ] as const;

  it.each(readers)('%s returns the array as stored', (_name, read) => {
    const stored = [{ id: 'a' }, { id: 'b' }];
    expect(read(stored as never)).toEqual(stored);
  });

  // The call sites all used `Array.isArray(x) ? x : []`; these reproduce it.
  it.each(readers)('%s falls back to empty for a column never written', (_name, read) => {
    expect(read(null)).toEqual([]);
    expect(read(undefined)).toEqual([]);
  });

  it.each(readers)('%s falls back to empty for a non-array value', (_name, read) => {
    expect(read({} as never)).toEqual([]);
    expect(read('nonsense' as never)).toEqual([]);
    expect(read(42 as never)).toEqual([]);
  });

  it.each(readers)('%s keeps an empty array as empty', (_name, read) => {
    expect(read([] as never)).toEqual([]);
  });

  // No validation on purpose: a row written by an older version may be missing
  // fields the current type declares, and it still has to load.
  it('does not reject rows that predate a field', () => {
    const legacyToken = [{ id: 'old', name: 'Goblin' }]; // no displayMode, no statBlock
    expect(readTokens(legacyToken as never)).toEqual(legacyToken);
  });

  it('returns the same array instance rather than a copy', () => {
    // Several call sites mutate the array in place and write it back, which
    // only works if nothing is cloned here.
    const stored: unknown[] = [{ id: 'a' }];
    expect(readTokens(stored as never)).toBe(stored);
  });
});

describe('readFogState', () => {
  it('returns the stored object', () => {
    const fog = { cols: 10, rows: 8, revealed: [1, 2, 3] };
    expect(readFogState(fog as never)).toEqual(fog);
  });

  // Null is meaningful here — no fog drawn, as distinct from fog covering
  // nothing — so it must survive rather than becoming an empty object.
  it('returns null when no fog has been drawn', () => {
    expect(readFogState(null)).toBeNull();
    expect(readFogState(undefined)).toBeNull();
  });

  it('returns null for an array, which is not a fog state', () => {
    expect(readFogState([] as never)).toBeNull();
  });
});

describe('readJsonObject', () => {
  it('returns an indexable record', () => {
    expect(readJsonObject({ sections: [], name: 'x' } as never)).toEqual({ sections: [], name: 'x' });
  });

  it('returns null for null, arrays and primitives', () => {
    expect(readJsonObject(null)).toBeNull();
    expect(readJsonObject(undefined)).toBeNull();
    expect(readJsonObject([] as never)).toBeNull();
    expect(readJsonObject('text' as never)).toBeNull();
  });
});

describe('toJson', () => {
  it('passes the value through untouched', () => {
    const value = { tokens: [{ id: 'a' }], nested: { deep: true } };
    expect(toJson(value)).toBe(value);
  });

  it('does not clone, so a caller writing back what it read stores the same data', () => {
    const tokens = readTokens([{ id: 'a' }] as never);
    expect(toJson(tokens)).toBe(tokens);
  });
});

describe('jsonOrNull', () => {
  // Pre-existing helper, covered here because this file is now the home for the
  // JSON boundary and it had no tests of its own.
  it('passes a present value through', () => {
    const value = { ac: 15 };
    expect(jsonOrNull(value)).toBe(value);
  });

  it('maps null and undefined to the JSON null sentinel', () => {
    // Prisma needs `JsonNull` rather than a bare null to clear a JSON column.
    expect(jsonOrNull(null)).toBe(Prisma.JsonNull);
    expect(jsonOrNull(undefined)).toBe(Prisma.JsonNull);
  });

  it('keeps falsy values that are not null', () => {
    expect(jsonOrNull(0)).toBe(0);
    expect(jsonOrNull('')).toBe('');
    expect(jsonOrNull(false)).toBe(false);
  });
});
