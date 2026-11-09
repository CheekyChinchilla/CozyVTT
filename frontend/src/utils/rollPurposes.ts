/**
 * What an attack's rolls are called in the Dice panel. The sheets and the
 * Roll... picker (characterRolls.ts) both name them here, so one roll is
 * never named two ways.
 */

/** A D&D 5e attack roll: "Longsword Attack". */
export const attackPurpose = (name: string) => `${name} Attack`;

/** A Pathfinder 2e Strike: "Longsword Strike". */
export const strikePurpose = (name: string) => `${name} Strike`;

/**
 * A damage roll: "Longsword Damage", or with a further damage line's label,
 * such as a versatile weapon's, "Longsword Damage (Two-handed)".
 */
export const damagePurpose = (name: string, line?: string) => (line ? `${name} Damage (${line})` : `${name} Damage`);
