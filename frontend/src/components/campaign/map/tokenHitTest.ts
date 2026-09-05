// ============================================
// Token hit testing and square occupancy.
// Pure: no React, no canvas, no component closures. Decides which token a
// click acts on, and which tokens stand in the way of a move.
// ============================================

import type { Token } from '@/types';
import { TokenLayer } from '@/types';
import type { CharacterHpInfo } from '@/utils/characterHp';
import { gridYToFogRow, gridXToFogCol, fogCellIndex } from './coords';

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
 * What a viewer is allowed to see of the map.
 *
 * `revealedCells` is null until fog data arrives, which means "show everything"
 * — the same convention the fog layer uses.
 */
export interface TokenVisibility {
  isDM: boolean;
  revealedCells: Set<number> | null;
  /** Players always see their own tokens; you know where you are. */
  isOwnToken: (token: Token) => boolean;
  /** DM-only view preference: spirit-layer tokens hidden from the canvas. */
  dmShowSpiritTokens: boolean;
  mapWidth: number;
  mapHeight: number;
}

/**
 * Whether this viewer can see a token at all.
 *
 * Written out here because the draw loop and the hover panel both need it and
 * used to disagree. Drawing skipped fogged tokens; hit testing did not, so the
 * lower-left panel happily named a creature standing in unrevealed dark that
 * the player could not see and had been given no other hint about. Fog is a
 * *rendering* filter — the token really is in the client's data, unlike a
 * DM-hidden one, which the server never sends at all.
 *
 * Deliberately excludes the dragged-token skip: that is a drawing concern (it
 * is drawn as a ghost instead), and a dragged token must stay hit-testable.
 */
export function isTokenVisibleTo(token: Token, view: TokenVisibility): boolean {
  // The server filters these out for players already; this is the safeguard.
  if (!token.visible && !view.isDM) return false;

  if (view.isDM) {
    if (!view.dmShowSpiritTokens && token.layer === TokenLayer.SPIRIT) return false;
    return true;
  }

  if (view.revealedCells && !view.isOwnToken(token)) {
    // Token grid Y is bottom-left origin; fog rows are top-left. See coords.ts.
    const fogRow = gridYToFogRow(token.position.y, token.size.height, view.mapHeight);
    const fogCol = gridXToFogCol(token.position.x, token.size.width);
    if (!view.revealedCells.has(fogCellIndex(fogCol, fogRow, { fogCols: view.mapWidth }))) {
      return false;
    }
  }

  return true;
}

/**
 * The hit points a viewer is allowed to see on a token.
 *
 * A player token follows its character sheet, which every campaign member may
 * already read. An NPC's own hit points are the DM's to reveal, so they show
 * only when the DM has turned the bar on — or to the DM themselves.
 */
export function visibleTokenHp(
  token: Token,
  characterHpCache: Record<string, CharacterHpInfo>,
  isDM: boolean
): CharacterHpInfo | null {
  // The sheet, when it is loaded. A character's hit points are readable by
  // every campaign member already, so this needs no gate.
  const fromSheet = token.characterId ? characterHpCache[token.characterId] : undefined;
  if (fromSheet) return fromSheet;

  // Falling back to the token's own copy does NOT skip the gate. It briefly
  // did: a bound token whose character was not in the cache — the window before
  // the roster fetch returns, or a character no member holds — returned
  // `token.hp` outright, showing hit points a DM had chosen to keep hidden.
  if (!token.hp || token.hp.max <= 0) return null;
  return isDM || token.showHpBar ? token.hp : null;
}

/**
 * The token a click at this cell should act on: the topmost drawn there.
 *
 * Array order is z-order, so this walks backwards. `view` filters to what the
 * caller can actually see; omit it only where visibility has already been
 * decided.
 */
export function pickTokenAt(
  tokens: readonly Token[],
  gridX: number,
  gridY: number,
  view?: TokenVisibility
): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (view ? !isTokenVisibleTo(token, view) : !token.visible) continue;
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
  canMove: (token: Token) => boolean,
  view?: TokenVisibility
): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (view ? !isTokenVisibleTo(token, view) : !token.visible) continue;
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
