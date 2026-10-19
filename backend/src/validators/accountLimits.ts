/**
 * The limits of an account: its display name, and how many two-factor backup
 * codes it is given.
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
/** How many single-use two-factor backup codes an account is given at a time. */
export const BACKUP_CODE_COUNT = 10;
