// ============================================
// Where a token's centre is, in map pixels
//
// The point a token sees from, and the point at which others see it. The
// server decides which tokens to send a player from it; the client draws
// sight from it and picks what a preview shows. It is the same file, byte for
// byte, in backend/src/utils and frontend/src/utils; a backend test fails if
// the two copies drift.
//
// Token grid coordinates count y from the bottom row, and a token covers
// `height` rows upward from its position. Map pixels count y from the top,
// so the centre is half the token's height below its top edge.
// ============================================

export interface CentredToken {
  position: { x: number; y: number };
  size?: { width: number; height: number } | null;
}

/** The centre of a token's box, in map pixels with y counted from the top. */
export function tokenCentre(token: CentredToken, gridSize: number, mapHeight: number): { x: number; y: number } {
  const width = token.size?.width ?? 1;
  const height = token.size?.height ?? 1;
  return {
    x: (token.position.x + width / 2) * gridSize,
    y: (mapHeight - token.position.y - height / 2) * gridSize,
  };
}
