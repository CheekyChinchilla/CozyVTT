// ============================================
// A held token, put back.
//
// Picking a token up and moving the cursor sends every other client a move
// per frame, so they draw the token wherever the cursor went. Placing it
// sends the final square. Cancelling the hold sent nothing, and the others
// were left showing the token at the last cursor position until it next
// moved. The release is one more move, back to the square it was picked up
// from, so their picture matches the one the server still holds.
// ============================================

import type { Token, TokenMoveEvent } from '@/types';

/** The move that puts a held token back where it was picked up. */
export function releaseHeldToken(token: Pick<Token, 'id' | 'position'>, mapId: string): TokenMoveEvent {
  return { tokenId: token.id, mapId, x: token.position.x, y: token.position.y };
}
