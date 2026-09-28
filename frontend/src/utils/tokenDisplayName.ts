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
}

export const UNKNOWN_CREATURE = 'Unknown creature';

/** The name this viewer may use. */
export function tokenDisplayName(token: NamedToken): string {
  return token.name.trim() === '' ? UNKNOWN_CREATURE : token.name;
}

/** The name to use in front of everyone. */
export function tokenPublicName(token: NamedToken): string {
  return token.obscured || token.visible === false || token.layer === 'spirit' ? UNKNOWN_CREATURE : tokenDisplayName(token);
}
