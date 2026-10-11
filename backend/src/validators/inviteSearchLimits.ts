/**
 * The limits of the Invite Player search.
 *
 * The server applies them and the Invite Player dialog tells the DM what they
 * are. This file exists twice, as backend/src/validators/inviteSearchLimits.ts
 * and frontend/src/constants/inviteSearchLimits.ts, and a test keeps the two
 * copies identical, so the dialog never describes a search the server does
 * not make.
 */

/** The shortest search that matches part of a name; a shorter one matches only whole names. */
export const INVITE_SEARCH_MIN_LENGTH = 2;
/** The most matches one search returns. */
export const INVITE_SEARCH_MAX_RESULTS = 20;
