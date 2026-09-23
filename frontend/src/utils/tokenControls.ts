import { TokenType } from '@/types';

/**
 * Which per-type controls a DM is offered for a token.
 *
 * These rules were written inline beside the JSX that used them, and drifted:
 * the map's right-click menu gated Hide from Players on the token being an
 * object, while the Token Roster eye, the Token Manager eye and the quick
 * editor all offered it for every type. A DM could hide an NPC from three
 * places and not from the map itself. One declaration, here, so the next
 * control added cannot disagree with the others.
 */
export interface DmTokenControls {
  /**
   * Hide from / Reveal to players. Every token can be hidden: a monster
   * waiting in a room, a trapped chest, a character who has left the scene.
   * A hidden token is never sent to players at all.
   */
  hide: boolean;
  /**
   * Send to / Recall from the Spirit Realm. Creatures cross planes; scenery
   * does not.
   */
  crossPlanes: boolean;
  /**
   * Offer "Hidden from players on placement" when the token is created. A
   * monster or an object is often staged before the table should know about
   * it; a player's own character is not a secret, and placing one hidden
   * would leave its player looking at a map with nothing on it. They can
   * still be hidden afterwards, like anything else.
   */
  placeHidden: boolean;
}

export function dmTokenControls(type: TokenType): DmTokenControls {
  return {
    hide: true,
    crossPlanes: type !== TokenType.OBJECT,
    placeHidden: type !== TokenType.PLAYER,
  };
}
