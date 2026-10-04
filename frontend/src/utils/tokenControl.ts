import type { Token } from '@/types';

/**
 * Whether this member controls this token.
 *
 * The one client-side definition of "my token", and it is the server's
 * (`canControlToken`): a player whom the token names as its controller. Both
 * halves matter. A token bound to one of the user's characters is not theirs
 * by that alone; the client used to count it, so a player could pick up a
 * token the server then refused to move, and on a lit map was drawn ground
 * the server sent them nothing for. And `controlledBy` is not cleared when a
 * player is demoted, so a spectator can still be named on a token; the
 * server treats it as nobody's, and so does this. The DM's authority over
 * every token is the callers' to grant, as `canMoveToken` does; this is the
 * player's rule. A token dragged from the roster, or created for a character
 * with no controller named, is controlled by the character's owner while
 * they are a player; the DM can hand control to any player in Edit Token.
 * `characterId` is accepted so callers can pass a whole token, and
 * deliberately not consulted.
 */
export function controlsToken(
  token: Pick<Token, 'controlledBy' | 'characterId'>,
  userId: string | null | undefined,
  role: string | null | undefined
): boolean {
  return role === 'PLAYER' && !!userId && token.controlledBy === userId;
}
