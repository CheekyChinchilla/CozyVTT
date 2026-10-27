// ============================================
// The selected token, as the keyboard works it: which tokens a viewer steps
// through with , and . and in what order, the square an arrow key moves a
// token to, and the pan that keeps the selection in sight.
//
// Pure: no React, no canvas. Grid coordinates count y from the bottom row
// (map/coords.ts), so "up" is a larger y.
// ============================================

import type { CombatState, Position, Token } from '@/types';

/** Forward (`.`) or back (`,`) through the list. */
export type StepDirection = 1 | -1;

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

const ARROWS: ReadonlySet<string> = new Set<ArrowKey>(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function isArrowKey(key: string): key is ArrowKey {
  return ARROWS.has(key);
}

/** The row a token's top edge is on, counting up from the bottom. */
const topRow = (t: Token): number => t.position.y + t.size.height;

/**
 * The tokens this viewer may act on, in a stable order: while a fight is on,
 * the combatants among them in turn order, then the rest by row from the top
 * of the map, then by column from the left. Two tokens on one square keep the
 * order they came in.
 */
export function selectableTokens(
  tokens: readonly Token[],
  mayAct: (t: Token) => boolean,
  combat: CombatState | null
): Token[] {
  const acting = tokens.filter(mayAct);
  const byPlace = [...acting].sort((a, b) => topRow(b) - topRow(a) || a.position.x - b.position.x);
  if (!combat?.active) return byPlace;

  const byId = new Map(acting.map((t) => [t.id, t]));
  const inTurn: Token[] = [];
  for (const c of combat.combatants) {
    const t = byId.get(c.tokenId);
    if (t && !inTurn.includes(t)) inTurn.push(t);
  }
  return [...inTurn, ...byPlace.filter((t) => !inTurn.includes(t))];
}

/**
 * The token after `currentId` in `ordered` (`direction` 1) or before it (-1),
 * wrapping round at either end. With nothing on the list selected, the first
 * going forward and the last going back; null when the list is empty.
 */
export function nextSelectedId(
  ordered: readonly Token[],
  currentId: string | null,
  direction: StepDirection
): string | null {
  if (ordered.length === 0) return null;
  const at = currentId === null ? -1 : ordered.findIndex((t) => t.id === currentId);
  if (at === -1) return (direction === 1 ? ordered[0] : ordered[ordered.length - 1]).id;
  return ordered[(at + direction + ordered.length) % ordered.length].id;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * The square `squares` steps away from `position` in the arrow's direction,
 * with the token's whole footprint kept on the map: the rule the server
 * clamps a drop by, so the mover's screen shows where the token will be.
 */
export function squareFromArrow(
  position: Position,
  size: { width: number; height: number },
  key: ArrowKey,
  squares: number,
  map: { width: number; height: number }
): Position {
  const dx = key === 'ArrowLeft' ? -squares : key === 'ArrowRight' ? squares : 0;
  const dy = key === 'ArrowDown' ? -squares : key === 'ArrowUp' ? squares : 0;
  return {
    x: clamp(position.x + dx, 0, Math.max(0, map.width - size.width)),
    y: clamp(position.y + dy, 0, Math.max(0, map.height - size.height)),
  };
}

/**
 * How far to pan, in canvas pixels, so that `point` lies at least `margin`
 * inside the canvas: nothing while it does, else just enough to bring it to
 * the margin. A canvas smaller than two margins centres the point; one with
 * no size yet pans nothing.
 */
export function panToKeepInView(
  point: { x: number; y: number },
  canvas: { width: number; height: number },
  margin: number
): { dx: number; dy: number } {
  if (canvas.width <= 0 || canvas.height <= 0) return { dx: 0, dy: 0 };
  const along = (at: number, size: number) => {
    const m = Math.min(margin, size / 2);
    return clamp(at, m, size - m) - at;
  };
  return { dx: along(point.x, canvas.width), dy: along(point.y, canvas.height) };
}
