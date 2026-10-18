/**
 * The limits on a campaign's name and description.
 *
 * The server refuses a campaign over them and the campaign dialogs stop each
 * box at them. This file exists twice, as backend/src/validators/campaignLimits.ts
 * and frontend/src/constants/campaignLimits.ts, and a test keeps the two
 * copies identical, so a dialog never allows what the server refuses.
 */
export const CAMPAIGN_LIMITS = {
  /** The longest a campaign's name may be. */
  maxNameLength: 200,
  /** The longest a campaign's description may be. */
  maxDescriptionLength: 5000,
} as const;
