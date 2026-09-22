import type { Token } from '@/types';

/**
 * Whether `userId` controls this token.
 *
 * The one client-side definition of "my token", and it is the server's: the
 * user the token names as its controller, which is what `canControlToken`
 * on the server decides moves and edits by. A token bound to one of the
 * user's characters is not theirs by that alone; the client used to count
 * it, so a player could pick up a token the server then refused to move, and
 * on a lit map was drawn ground the server sent them nothing for. A token
 * dragged from the roster, or created for a character with no controller
 * named, is controlled by the character's owner; the DM can hand control to
 * anyone in Edit Token. `characterId` is accepted so callers can pass a whole
 * token, and deliberately not consulted.
 */
export function controlsToken(
  token: Pick<Token, 'controlledBy' | 'characterId'>,
  userId: string | null | undefined
): boolean {
  return !!userId && token.controlledBy === userId;
}
