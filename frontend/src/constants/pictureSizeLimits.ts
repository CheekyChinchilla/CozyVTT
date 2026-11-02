/**
 * The largest picture CozyVTT keeps, on each side.
 *
 * The server refuses a picture wider or taller than this, and a map drawn in
 * CozyVTT is never made larger. This file exists twice, as
 * backend/src/validators/pictureSizeLimits.ts and
 * frontend/src/constants/pictureSizeLimits.ts, and a test keeps the two
 * copies identical, so a drawn map is never one the server refuses.
 */
export const PICTURE_SIZE_LIMITS = {
  /** The most pixels a picture, or each frame of one, may be on each side. */
  maxSide: 16_384,
} as const;
