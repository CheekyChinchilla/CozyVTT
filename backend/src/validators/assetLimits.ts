/**
 * The limits on what an upload says about itself: its name, description and
 * tags, and the one tag kept for the pictures Paint makes.
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

/**
 * The tag every picture Paint makes carries, which is how a map's picture is
 * known to be one Paint may change and a save may write over: matched exactly,
 * case included. Only a campaign map picture, which only the campaign's DM
 * may upload, may carry it; every other upload is refused it, in any case,
 * and a campaign archive's import leaves it out. A tag no earlier version
 * made, so none a DM typed then means this.
 */
export const DRAWN_MAP_TAG = 'cozyvtt-drawn-map';

/** What an upload that may not carry DRAWN_MAP_TAG is told, by the server and by the upload window. */
export const DRAWN_MAP_TAG_REFUSAL = `The tag ${DRAWN_MAP_TAG} is kept for maps drawn in CozyVTT.`;

/**
 * The version after a drawn picture's address, `/api/assets/maps/<id>?v=<n>`,
 * exactly: a save in Paint writes over the picture under the same id, and
 * gives the map its address with a new version, so each open table loads the
 * new picture. The address names the same asset as the one without it.
 */
export const PICTURE_VERSION_QUERY = /^\?v=\d{1,16}$/;
