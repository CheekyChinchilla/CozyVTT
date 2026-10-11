/**
 * The limits on what an upload says about itself: its name, description and
 * tags.
 *
 * The server refuses an upload over them and the upload dialog stops each box
 * at them. This file exists twice, as backend/src/validators/assetLimits.ts
 * and frontend/src/constants/assetLimits.ts, and a test keeps the two copies
 * identical, so the dialog never allows what the server refuses.
 */
export const ASSET_LIMITS = {
  /** The longest name an asset may have. */
  maxNameLength: 200,
  /** The longest description. */
  maxDescriptionLength: 1000,
  /** The most tags one asset may have. */
  maxTags: 50,
  /** The longest tag. */
  maxTagLength: 50,
} as const;
