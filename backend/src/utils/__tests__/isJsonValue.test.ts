/**
 * isJsonValue tells a value a JSON column can hold from one it cannot, so a
 * value built from a column's own value is treated as one by a check, never
 * by a cast.
 */

import { isJsonValue } from '../prisma-json';

describe('isJsonValue', () => {
  it.each([
    ['null', null],
    ['text', 'x'],
    ['true', true],
    ['a number', 1.5],
    ['a list of values', [1, 'a', null, [false]]],
    ['a plain object of values', { a: 1, b: { c: ['d'] } }],
  ])('takes %s', (_label, value) => {
    expect(isJsonValue(value)).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['a number that is not finite', Number.NaN],
    ['an object holding undefined', { a: undefined }],
    ['a list holding a function', [() => 1]],
    ['a date', new Date(0)],
    ['a map', new Map()],
  ])('refuses %s', (_label, value) => {
    expect(isJsonValue(value)).toBe(false);
  });
});
