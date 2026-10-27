// ============================================
// A held token: where it is drawn, the square a pointer carries it to, and
// the move that puts it back.
//
// Picking a token up and moving the cursor sends every other client a move
// per frame, so they draw the token wherever the cursor went. Placing it
// sends the final square. Cancelling the hold sent nothing, and the others
// were left showing the token at the last cursor position until it next
// moved. The release is one more move, back to the square it was picked up
// from, so their picture matches the one the server still holds.
//
// A mouse carries a held token wherever it goes over the map, and so does a
// pen hovering over it. A finger carries one only while it drags it; a token
// taken by a tap stays on its own square when the finger lifts, and while
// another drag pans the map, until a tap puts it down. Where nothing carries
// it, it is drawn on its own square, as the store has it.
// ============================================

import type { Position, Token, TokenMoveEvent } from '@/types';

/** The move that puts a held token back where it was picked up. */
export function releaseHeldToken(token: Pick<Token, 'id' | 'position'>, mapId: string): TokenMoveEvent {
  return { tokenId: token.id, mapId, x: token.position.x, y: token.position.y };
}

/**
 * A pointer carrying a held token: the grid square under it, and the square
 * of the token it took the token by, counted from the token's own square.
 */
export interface Carrier {
  square: Position;
  offset: Position;
}

/**
 * The square a carried token stands on: the pointer's square less the
 * offset, so the square it was taken by stays under the pointer, and kept
 * whole on the map.
 */
export function carriedSquare(carrier: Carrier, size: Token['size'], map: { width: number; height: number }): Position {
  return {
    x: Math.floor(Math.max(0, Math.min(carrier.square.x - carrier.offset.x, map.width - size.width))),
    y: Math.floor(Math.max(0, Math.min(carrier.square.y - carrier.offset.y, map.height - size.height))),
  };
}

/**
 * Where a held token is drawn: under the pointer that carries it while one
 * does, and otherwise on its own square. `held` is the token as the store
 * has it, whose square someone else's move may have changed.
 */
export function heldDrawnAt(held: Pick<Token, 'position' | 'size'>, carrier: Carrier | null, map: { width: number; height: number }): Position {
  return carrier ? carriedSquare(carrier, held.size, map) : held.position;
}
