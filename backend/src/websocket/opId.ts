// ============================================
// Operation ids on wall, light and drawing edits
//
// The server sends every wall, light and drawing change to everyone on the
// map who may see it, the sender included. The sending page has already drawn
// its change, and may have made another since, so it needs to tell the echo
// of its own edit from anyone else's. A page attaches a random id to each
// edit it sends and the broadcast carries it back, as a drawing's
// acknowledgement does. An edit without one is broadcast without one, so a
// client that never sends ids sees no difference.
// ============================================

/** Letters, digits, dashes and underscores, as a random UUID is. */
const OP_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The operation id an edit was sent with, ready to spread into its
 * broadcast. Anything that is not a short id is dropped, not refused: the id
 * only labels the broadcast, and the edit is valid without it.
 */
export function echoedOpId(data: unknown): { opId?: string } {
  if (typeof data !== 'object' || data === null) return {};
  const opId: unknown = (data as { opId?: unknown }).opId;
  return typeof opId === 'string' && OP_ID.test(opId) ? { opId } : {};
}
