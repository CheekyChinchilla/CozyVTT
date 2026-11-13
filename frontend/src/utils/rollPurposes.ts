// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * What an attack's rolls are called in the Dice panel. The sheets and the
 * Roll... picker (characterRolls.ts) both name them here, so one roll is
 * never named two ways.
 */

/** A 5E attack roll: "Longsword Attack". */
export const attackPurpose = (name: string) => `${name} Attack`;

/** A Fantasy d20 Strike: "Longsword Strike". */
export const strikePurpose = (name: string) => `${name} Strike`;

/**
 * A damage roll: "Longsword Damage", or with a further damage line's label,
 * such as a versatile weapon's, "Longsword Damage (Two-handed)".
 */
export const damagePurpose = (name: string, line?: string) => (line ? `${name} Damage (${line})` : `${name} Damage`);
