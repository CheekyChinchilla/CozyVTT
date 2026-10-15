/**
 * Settings read from the environment as whole numbers.
 *
 * The session durations and the general rate limit were parsed with bare
 * parseInt and never checked, so "8h" became 8 milliseconds and signed
 * everyone out as they signed in, and a word became NaN, which turned the
 * general rate limit off. A value that is not a whole number of at least 1
 * now falls back to the default, with a warning that names the variable.
 */

import logger from '../../utils/logger';
import { positiveIntegerFromEnv } from '../env';

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
});

afterEach(() => {
  warn.mockRestore();
});

it('reads a whole number, with surrounding space allowed', () => {
  expect(positiveIntegerFromEnv('SESSION_MAX_AGE', 3600000, { SESSION_MAX_AGE: '7200000' })).toBe(7200000);
  expect(positiveIntegerFromEnv('SESSION_MAX_AGE', 3600000, { SESSION_MAX_AGE: ' 7200000 ' })).toBe(7200000);
  expect(warn).not.toHaveBeenCalled();
});

it('uses the default, with no warning, when the variable is unset or blank', () => {
  expect(positiveIntegerFromEnv('SESSION_MAX_AGE', 3600000, {})).toBe(3600000);
  expect(positiveIntegerFromEnv('SESSION_MAX_AGE', 3600000, { SESSION_MAX_AGE: '  ' })).toBe(3600000);
  expect(warn).not.toHaveBeenCalled();
});

it.each([
  ['a unit suffix', '8h'],
  ['a word', 'one hour'],
  ['a decimal', '1.5'],
  ['zero', '0'],
  ['a negative number', '-5'],
  ['a number with a sign', '+300'],
])('falls back to the default and names the variable when the value is %s', (_label, value) => {
  expect(positiveIntegerFromEnv('RATE_LIMIT_MAX_REQUESTS', 300, { RATE_LIMIT_MAX_REQUESTS: value })).toBe(300);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain('RATE_LIMIT_MAX_REQUESTS');
  expect(warn.mock.calls[0][0]).toContain('300');
});
