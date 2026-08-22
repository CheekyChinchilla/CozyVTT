// ============================================
// Player colour — a stable identity colour derived from a user id
//
// CozyVTT has no per-user colour field, and adding one would mean a schema
// change plus a backfill for every existing deployment. Hashing the id instead
// gives a colour that is stable across sessions, identical on every client,
// and needs nothing synced — at the cost of nobody picking their own.
//
// The palette is deliberately not themed. These colours are drawn over
// arbitrary user-uploaded map images, where a theme's accent offers no
// guarantee of contrast; callers pair them with a dark casing (see
// drawPings.ts) so the mark reads on any background.
// ============================================

/**
 * Ten hues that stay distinguishable from each other and legible over both
 * light and dark map art. Deliberately avoids the gold used by the initiative
 * turn ring, so a ping is never mistaken for "it's your turn".
 */
export const PLAYER_COLORS = [
  '#e05252', // red
  '#e0873f', // orange
  '#d9c33c', // chartreuse-yellow
  '#5fbf5f', // green
  '#3fbfa3', // teal
  '#45a8e0', // sky
  '#5b6fe0', // indigo
  '#9b5fd9', // violet
  '#d95fb0', // magenta
  '#b0785a', // clay
] as const;

/**
 * FNV-1a — a small, well-distributed string hash. Chosen over summing char
 * codes, which clusters badly for ids sharing a prefix (UUIDs from the same
 * generator often do).
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    // 32-bit FNV prime multiply, via shifts to stay in integer range
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The stable identity colour for a user, as a hex string. */
export function playerColor(userId: string): string {
  if (!userId) return PLAYER_COLORS[0];
  return PLAYER_COLORS[hashString(userId) % PLAYER_COLORS.length];
}
