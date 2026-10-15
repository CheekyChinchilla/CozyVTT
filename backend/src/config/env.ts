import logger from '../utils/logger';

/**
 * A setting read from the environment as a whole number of at least 1.
 *
 * These are read once at start. A value that is not such a number, for
 * example one with a unit ("8h"), falls back to the default with a warning
 * that names the variable, so a typo in .env never stops the server and never
 * quietly changes what it does: parseInt made "8h" into eight milliseconds,
 * which signed everyone out as they signed in, and made a word into NaN, which
 * turned the general rate limit off.
 *
 * The environment is a parameter so the tests need not change the real one.
 */
export function positiveIntegerFromEnv(
  name: string,
  fallback: number,
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    if (value >= 1 && Number.isSafeInteger(value)) return value;
  }
  logger.warn(`Invalid ${name}="${raw}": expected a whole number of at least 1. Using the default ${fallback}.`);
  return fallback;
}
