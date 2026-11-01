/**
 * Dice limits the browser and the server share.
 *
 * This file exists twice, as backend/src/validators/diceLimits.ts and
 * frontend/src/constants/diceLimits.ts, and a test keeps the two copies
 * identical, so the dice panel and the Saved window never take more than the
 * server stores.
 */

/**
 * The longest character name a roll carries. The roll's character is a label
 * shown to the table, bounded like every other name.
 */
export const MAX_ROLL_CHARACTER_NAME_LENGTH = 200;

/**
 * The longest purpose a roll carries, a little longer than a name because the
 * sheets build it from one ("<attack name> Damage (Versatile)").
 */
export const MAX_ROLL_PURPOSE_LENGTH = 300;

/**
 * The character a saved roll is made as goes out as the roll's own character
 * name, so it takes the roll's limit.
 */
export const MAX_MACRO_CHARACTER_NAME_LENGTH = MAX_ROLL_CHARACTER_NAME_LENGTH;

/** A saved roll's own purpose: under a roll's, which also has room for what a sheet adds. */
export const MAX_MACRO_PURPOSE_LENGTH = 200;
