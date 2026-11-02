/**
 * Finding and removing U+0000, the null character PostgreSQL cannot store,
 * in what a request, an event or a campaign archive carries.
 */

import { holdsNulCharacter, removeNulCharacters } from '../nulCharacter';

/** A list nested `depth` deep, with `inner` at the bottom. */
function nested(depth: number, inner: unknown): unknown {
  let value: unknown = inner;
  for (let i = 0; i < depth; i++) value = [value];
  return value;
}

describe('holdsNulCharacter', () => {
  it.each([
    ['text', 'a\u0000b'],
    ['an item of a list', ['ok', 'a\u0000b']],
    ['a value of an object', { name: 'ok', notes: { text: '\u0000' } }],
    ['a key', { notes: { 'sec\u0000ret': 1 } }],
    ['an object made without a prototype, as a form is read', Object.assign(Object.create(null), { tags: 'a\u0000' })],
  ])('finds it in %s', (_where, value) => {
    expect(holdsNulCharacter(value)).toBe(true);
  });

  it.each([
    ['plain text', 'Written as \\u0000'],
    ['numbers, flags and nothing', [1, true, null, undefined, { a: 2 }]],
    ['a function, as an event passes its acknowledgement', [() => '\u0000']],
    ['the bytes of a Buffer', Buffer.from('a\u0000b')],
  ])('finds none in %s', (_where, value) => {
    expect(holdsNulCharacter(value)).toBe(false);
  });

  it('walks data nested deeper than the call stack goes', () => {
    expect(holdsNulCharacter(nested(200_000, 'a\u0000'))).toBe(true);
    expect(holdsNulCharacter(nested(200_000, 'a'))).toBe(false);
  });
});

describe('removeNulCharacters', () => {
  it('takes it out of every text, keys included, and counts what it took', () => {
    const data = { name: 'Gob\u0000lin', 'not\u0000es': ['\u0000a\u0000', 7], statBlock: { speed: '30 ft.' } };

    const { value, removed } = removeNulCharacters(data);

    expect(value).toBe(data);
    expect(value).toEqual({ name: 'Goblin', notes: ['a', 7], statBlock: { speed: '30 ft.' } });
    expect(removed).toBe(4);
  });

  it('returns text given on its own without it', () => {
    expect(removeNulCharacters('a\u0000b')).toEqual({ value: 'ab', removed: 1 });
    expect(removeNulCharacters({ a: 'b' })).toEqual({ value: { a: 'b' }, removed: 0 });
  });

  it('keeps a key that reads __proto__ once cleaned as a key, leaving the prototype alone', () => {
    const data = JSON.parse('{"__pro\\u0000to__": {"polluted": true}}') as Record<string, unknown>;

    removeNulCharacters(data);

    expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
    expect(Object.keys(data)).toEqual(['__proto__']);
    expect('polluted' in data).toBe(false);
  });

  it('walks data nested deeper than the call stack goes', () => {
    const deep = nested(200_000, 'a\u0000');
    expect(removeNulCharacters(deep).removed).toBe(1);
    expect(holdsNulCharacter(deep)).toBe(false);
  });
});
