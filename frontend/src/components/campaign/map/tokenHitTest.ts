// ============================================
// Token hit testing and square occupancy.
// Pure: no React, no canvas, no component closures. Decides which token a
// click acts on, and which tokens stand in the way of a move.
// ============================================

import type { Token } from '@/types';
import type { CharacterHpInfo } from '@/utils/characterHp';

/** Whether a grid cell falls inside a token's footprint. */
export function tokenCoversCell(token: Token, gridX: number, gridY: number): boolean {
  return (
    gridX >= token.position.x &&
    gridX < token.position.x + token.size.width &&
    gridY >= token.position.y &&
    gridY < token.position.y + token.size.height
  );
}

/**
 * The hit points a token actually shows.
 *
 * A token bound to a character follows that character's sheet; the `hp` stored
 * on the token is a copy taken when it was placed and goes stale the moment the
 * sheet is edited. Unbound tokens — creature-library NPCs, objects — carry
 * their own and have no sheet to follow.
 */
export function effectiveTokenHp(
  token: Token,
  characterHpCache: Record<string, CharacterHpInfo>
): CharacterHpInfo | null {
  if (token.characterId) return characterHpCache[token.characterId] ?? token.hp ?? null;
  return token.hp ?? null;
}

/**
 * Whether a token is down — at zero hit points.
 *
 * A token tracking no hit points at all is never down. Most scenery and objects
 * have none, and counting those as bodies would let anyone stand on a closed
 * door.
 */
export function isTokenDowned(
  token: Token,
  characterHpCache: Record<string, CharacterHpInfo>
): boolean {
  const hp = effectiveTokenHp(token, characterHpCache);
  return hp !== null && hp.current <= 0;
}

/**
 * The token a click at this cell should act on: the topmost drawn there.
 *
 * Array order is z-order, so this walks backwards. Hidden tokens are skipped —
 * for a player they never arrive from the server at all, and for a DM they are
 * still theirs to click.
 */
export function pickTokenAt(
  tokens: readonly Token[],
  gridX: number,
  gridY: number
): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (!token.visible) continue;
    if (tokenCoversCell(token, gridX, gridY)) return token;
  }
  return null;
}

/**
 * The topmost token at this cell that `canMove` accepts.
 *
 * Taking the topmost token outright is what lost players their tokens: an NPC
 * standing on the same square is drawn later, so the hit test returned the NPC,
 * the caller's permission check rejected it, and the click did nothing — while
 * the player's own token sat underneath, unreachable and hidden. Looking past
 * what the caller cannot move means your own token is always still yours to
 * pick up, whatever is standing on it.
 */
export function pickMovableTokenAt(
  tokens: readonly Token[],
  gridX: number,
  gridY: number,
  canMove: (token: Token) => boolean
): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (!token.visible) continue;
    if (tokenCoversCell(token, gridX, gridY) && canMove(token)) return token;
  }
  return null;
}

/** Whether two footprints overlap on any cell. */
function footprintsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Tokens standing where `moving` is trying to end up.
 *
 * The Basic Rules are blunt about this (p. 74, "Moving Around Other
 * Creatures"): "Whether a creature is a friend or an enemy, you can't willingly
 * end your move in its space." A token at zero hit points is treated as no
 * longer holding its space, so a body can be stood on — that part is a house
 * choice rather than something the rules spell out.
 *
 * Only the same layer counts: a spirit-realm token does not block a token on
 * the material one. Hidden tokens are skipped as well, and deliberately so —
 * this runs on the client, where a player has never been sent them. Enforcing
 * the same rule on the server would turn a refused move into a way to probe for
 * invisible creatures, which is exactly the kind of leak the server-side token
 * filter exists to prevent.
 */
export function blockingTokensAt(
  tokens: readonly Token[],
  moving: Token,
  target: { x: number; y: number },
  characterHpCache: Record<string, CharacterHpInfo>
): Token[] {
  const footprint = {
    x: target.x,
    y: target.y,
    width: moving.size.width,
    height: moving.size.height,
  };

  return tokens.filter((token) => {
    if (token.id === moving.id) return false;
    if (!token.visible) return false;
    if (token.layer !== moving.layer) return false;
    if (isTokenDowned(token, characterHpCache)) return false;
    return footprintsOverlap(footprint, {
      x: token.position.x,
      y: token.position.y,
      width: token.size.width,
      height: token.size.height,
    });
  });
}
