/**
 * What to call a token.
 *
 * A player receives an obscured token with its name blanked (the server's
 * mask, utils/tokenMask.ts); the DM receives it whole. So a blank name means
 * "you may not know", and the same helper names the token correctly for
 * whoever is looking. The second form is for anything said in front of the
 * whole table, a roll in the dice log for instance: there an obscured token
 * is not named even by the DM, who knows perfectly well what it is, and
 * neither is a hidden one, which players are not sent at all, nor one on the
 * spirit layer, which players on the material plane are not sent.
 */

export interface NamedToken {
  name: string;
  obscured?: boolean;
  visible?: boolean;
  layer?: string;
  controlledBy?: string | null;
}

export const UNKNOWN_CREATURE = 'Unknown creature';

/** The name this viewer may use. */
export function tokenDisplayName(token: NamedToken): string {
  return token.name.trim() === '' ? UNKNOWN_CREATURE : token.name;
}

/** Whether a token may not be named in front of everyone. */
function unnamedInPublic(token: NamedToken): boolean {
  return token.obscured === true || token.visible === false || token.layer === 'spirit';
}

/** The name to use in front of everyone. */
export function tokenPublicName(token: NamedToken): string {
  return unnamedInPublic(token) ? UNKNOWN_CREATURE : tokenDisplayName(token);
}

/**
 * The name a roll from a character's sheet goes under when it is made from
 * this token: none of its own (the character's name) unless the token may
 * not be named in front of everyone. The dice log already names whoever
 * rolled, so a roll by the token's own controller (a player who has crossed
 * to the spirit plane, say) keeps the character's name: going unnamed would
 * hide nothing.
 */
export function characterRollPublicName(token: NamedToken | undefined, rollerId: string | undefined): string | undefined {
  if (!token || (rollerId !== undefined && token.controlledBy === rollerId)) return undefined;
  return unnamedInPublic(token) ? UNKNOWN_CREATURE : undefined;
}
