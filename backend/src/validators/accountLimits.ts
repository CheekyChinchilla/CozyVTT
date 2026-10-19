/**
 * The limits of an account's display name.
 *
 * The server applies them and Profile, Sign Up and the setup wizard check
 * them before sending. This file exists twice, as
 * backend/src/validators/accountLimits.ts and
 * frontend/src/constants/accountLimits.ts, and a test keeps the two copies
 * identical, so a page never refuses a name the server would take.
 */

/** The fewest characters a display name has, counted after cleaning. */
export const DISPLAY_NAME_MIN_LENGTH = 1;
/** The most characters a display name has. */
export const DISPLAY_NAME_MAX_LENGTH = 50;
