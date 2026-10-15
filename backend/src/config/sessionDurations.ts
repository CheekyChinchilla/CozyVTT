import { positiveIntegerFromEnv } from './env';

/**
 * How long a sign-in lasts, read once at start. Kept apart from the session
 * store's settings so the routes and guards that need these numbers do not
 * open a database pool to get them.
 */

/** A sign-in ends after this long with no request: an hour unless SESSION_MAX_AGE says otherwise. */
export const sessionMaxAge = positiveIntegerFromEnv('SESSION_MAX_AGE', 60 * 60 * 1000);

/** The "remember me" window: 30 days unless REMEMBER_ME_MAX_AGE says otherwise. */
export const rememberMeMaxAge = positiveIntegerFromEnv('REMEMBER_ME_MAX_AGE', 30 * 24 * 60 * 60 * 1000);
