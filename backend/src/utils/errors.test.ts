/**
 * Error accessors.
 *
 * These replace the backend's `catch (err: any)` bindings. What matters is that
 * they return exactly what the unchecked property access returned, and
 * `undefined` rather than a fallback — call sites use both `||` and `??`, which
 * disagree on an empty string.
 */

import { errorCode, errorMessage, errorStack } from './errors';

describe('errorMessage', () => {
  it('reads a real Error', () => {
    expect(errorMessage(new Error('kaboom'))).toBe('kaboom');
  });

  it('reads a plain object carrying a string message', () => {
    expect(errorMessage({ message: 'from an object' })).toBe('from an object');
  });

  it('keeps an empty message so the call site decides', () => {
    expect(errorMessage(new Error(''))).toBe('');
    expect(errorMessage(new Error('')) ?? 'fallback').toBe('');
    expect(errorMessage(new Error('')) || 'fallback').toBe('fallback');
  });

  it.each([
    ['a bare string', 'thrown string'],
    ['a number', 7],
    ['null', null],
    ['undefined', undefined],
    ['an object with no message', { code: 'P2002' }],
    ['a non-string message', { message: { nested: true } }],
  ])('returns undefined for %s', (_label, thrown) => {
    expect(errorMessage(thrown)).toBeUndefined();
  });
});

describe('errorCode', () => {
  it('reads a Node filesystem error code', () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    expect(errorCode(err)).toBe('ENOENT');
  });

  it('reads a Prisma known-request error code', () => {
    expect(errorCode({ code: 'P2002', meta: { target: ['email'] } })).toBe('P2002');
  });

  it('returns undefined when there is no code', () => {
    expect(errorCode(new Error('plain'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });

  it('ignores a numeric code rather than reporting it as a string', () => {
    expect(errorCode({ code: 42 })).toBeUndefined();
  });
});

describe('errorStack', () => {
  it('reads a real Error stack', () => {
    expect(errorStack(new Error('trace me'))).toContain('trace me');
  });

  // Duck-typed on purpose: an error that crossed a serialisation boundary, or
  // came from a library with its own Error subclass in another realm, still
  // carries a usable stack. Dropping it is the wrong failure mode for the one
  // accessor whose whole job is diagnosis.
  it('reads a stack off an error-shaped object that is not an Error', () => {
    expect(errorStack({ stack: 'at somewhere' })).toBe('at somewhere');
  });

  it.each([
    ['no stack', { message: 'x' }],
    ['a non-string stack', { stack: 42 }],
    ['null', null],
    ['a bare string', 'thrown'],
  ])('returns undefined for %s', (_label, thrown) => {
    expect(errorStack(thrown)).toBeUndefined();
  });
});
