/**
 * The limits on a token's conditions.
 *
 * The server refuses a token over them and the token editor's box for a
 * condition of the DM's own stops at them. This file exists twice, as
 * backend/src/validators/tokenLimits.ts and frontend/src/constants/tokenLimits.ts,
 * and a test keeps the two copies identical, so the editor never allows what
 * the server refuses.
 */
export const TOKEN_LIMITS = {
  /** The most conditions one token may carry. */
  maxConditions: 50,
  /** The longest condition, such as "Frightened 2". */
  maxConditionLength: 60,
} as const;
