// ============================================
// Telling this page's own wall and light edits from everyone else's.
//
// The server sends every wall and light change to everyone on the map, the
// sender included. The sending page has drawn its change already, and may
// have made another before the echo arrives, so applying its own echo would
// put back an older list. The DM's page used to skip every wall and light
// event for that reason, which also threw away a player's door toggle and
// any change made through the API, and the DM's next bulk edit then sent the
// stale list back to everyone.
//
// Each edit now carries a random operation id, which the server echoes. A
// page skips an event carrying an id it sent and applies every other one. An
// event with no id, from a REST route, an older server or the answer to
// walls:request, is never the page's own.
// ============================================

import { randomId } from '@/utils/uuid';

export interface OwnEdits {
  /** The payload with a fresh operation id, remembered as this page's. */
  tag<T extends object>(payload: T): T & { opId: string };
  /** Whether an event is the echo of an edit this page sent. Each id matches once. */
  isOwn(event: { opId?: unknown }): boolean;
}

/**
 * At most this many ids are remembered. An edit the server refuses is never
 * echoed, so its id would otherwise stay for good; the oldest go first.
 */
const REMEMBERED = 500;

export function createOwnEdits(makeId: () => string = randomId): OwnEdits {
  const sent = new Set<string>();
  return {
    tag(payload) {
      const opId = makeId();
      sent.add(opId);
      if (sent.size > REMEMBERED) {
        const oldest = sent.values().next().value;
        if (oldest !== undefined) sent.delete(oldest);
      }
      return { ...payload, opId };
    },
    isOwn(event) {
      return typeof event.opId === 'string' && sent.delete(event.opId);
    },
  };
}
