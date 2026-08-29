/**
 * Error accessors.
 *
 * These replace 71 `catch (err: any)` bindings, so the thing worth pinning is
 * that they return exactly what the unchecked property chains returned — most
 * of all that they return `undefined` rather than a fallback, because call sites
 * use both `||` and `??` and those differ on an empty string.
 */

import { describe, it, expect } from 'vitest';
import {
  apiErrorMessage,
  apiErrorStatus,
  apiErrorText,
  apiValidationIssues,
  errorMessage,
} from '../errors';

/** An axios-shaped rejection, as this API produces. */
const axiosError = (data: unknown, status = 400) => ({ response: { status, data } });

describe('apiErrorMessage', () => {
  it('reads response.data.message', () => {
    expect(apiErrorMessage(axiosError({ message: 'Name already taken' }))).toBe('Name already taken');
  });

  it.each([
    ['no response', new Error('boom')],
    ['no data', { response: { status: 500 } }],
    ['no message', axiosError({ error: 'nope' })],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'just a string'],
  ])('returns undefined for %s', (_label, thrown) => {
    expect(apiErrorMessage(thrown)).toBeUndefined();
  });

  // The reason these take no fallback argument. Both operators appear in the
  // codebase against this value and they disagree here; folding a fallback into
  // the helper would silently pick one.
  it('preserves an empty message so the call site\'s operator decides', () => {
    const empty = axiosError({ message: '' });
    expect(apiErrorMessage(empty)).toBe('');
    expect(apiErrorMessage(empty) ?? 'fallback').toBe('');       // ?? keeps it
    expect(apiErrorMessage(empty) || 'fallback').toBe('fallback'); // || replaces it
  });

  it('ignores a non-string message rather than passing it to the UI', () => {
    expect(apiErrorMessage(axiosError({ message: { nested: true } }))).toBeUndefined();
    expect(apiErrorMessage(axiosError({ message: 42 }))).toBeUndefined();
  });
});

describe('apiErrorText', () => {
  it('reads response.data.error, separately from message', () => {
    const both = axiosError({ error: 'Invalid credentials', message: 'Unauthorized' });
    expect(apiErrorText(both)).toBe('Invalid credentials');
    expect(apiErrorMessage(both)).toBe('Unauthorized');
  });

  it('returns undefined when absent', () => {
    expect(apiErrorText(axiosError({ message: 'only a message' }))).toBeUndefined();
  });
});

describe('apiErrorStatus', () => {
  it('reads the HTTP status', () => {
    expect(apiErrorStatus(axiosError({}, 403))).toBe(403);
  });

  it('returns undefined for a non-axios error', () => {
    expect(apiErrorStatus(new Error('network'))).toBeUndefined();
  });

  it('keeps 0 rather than treating it as missing', () => {
    expect(apiErrorStatus(axiosError({}, 0))).toBe(0);
  });
});

describe('apiValidationIssues', () => {
  it('maps the backend Zod report', () => {
    const err = axiosError({
      validationErrors: [
        { path: 'stats.dexterity.score', message: 'Expected number', code: 'invalid_type' },
        { path: 'level', message: 'Too small' },
      ],
    });
    expect(apiValidationIssues(err)).toEqual([
      // `code` is carried through when the backend sends it, so the console
      // diagnostic is no quieter than the raw payload was.
      { path: 'stats.dexterity.score', message: 'Expected number', code: 'invalid_type' },
      { path: 'level', message: 'Too small' },
    ]);
  });

  it('returns undefined when there are none', () => {
    expect(apiValidationIssues(axiosError({ message: 'nope' }))).toBeUndefined();
  });

  it('returns undefined when it is not an array', () => {
    expect(apiValidationIssues(axiosError({ validationErrors: 'oops' }))).toBeUndefined();
  });

  // Call sites branch on the result being truthy, where the old code branched on
  // `validationErrors && Array.isArray(validationErrors)`. An empty array is
  // truthy under both, so it must stay an array here rather than becoming
  // undefined — otherwise a rejected save with no itemised issues would take a
  // different branch than it used to.
  it('returns an empty array, not undefined, for an empty report', () => {
    const issues = apiValidationIssues(axiosError({ validationErrors: [] }));
    expect(issues).toEqual([]);
    expect(issues ? 'validation branch' : 'generic branch').toBe('validation branch');
  });

  it('survives malformed entries rather than throwing mid-render', () => {
    const err = axiosError({ validationErrors: [null, { path: 1, message: undefined }] });
    expect(apiValidationIssues(err)).toEqual([
      { path: '', message: '' },
      { path: '1', message: '' },
    ]);
  });
});

describe('errorMessage', () => {
  it('reads a real Error', () => {
    expect(errorMessage(new Error('kaboom'))).toBe('kaboom');
  });

  it('reads a plain object carrying a string message', () => {
    expect(errorMessage({ message: 'from an object' })).toBe('from an object');
  });

  it.each([
    ['a bare string', 'thrown string'],
    ['a number', 7],
    ['null', null],
    ['an object with no message', { code: 'X' }],
  ])('returns undefined for %s', (_label, thrown) => {
    expect(errorMessage(thrown)).toBeUndefined();
  });

  it('keeps an empty Error message', () => {
    expect(errorMessage(new Error(''))).toBe('');
  });
});
