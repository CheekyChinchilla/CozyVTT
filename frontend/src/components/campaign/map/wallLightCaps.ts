// ============================================
// The caps on a map's walls and lights, as the wall and light tools apply
// them before they draw, and the server's answer to an edit they sent.
//
// Pure: no React, no socket.
// ============================================

import { MAP_LIMITS } from '@/constants/mapLimits';

/**
 * Whether an edit taking a map from `before` walls to `after` goes past the
 * cap: it adds walls, and the map would then hold more than it may. A map
 * already past it, from before there was one, may still lose walls.
 */
export function pastWallCap(before: number, after: number): boolean {
  return after > before && after > MAP_LIMITS.maxWallSegments;
}

/** Whether a map holding `count` lights has room for none more. */
export function atLightCap(count: number): boolean {
  return count >= MAP_LIMITS.maxLightSources;
}

/**
 * How long a wall or light edit waits for the server's answer, as the other
 * answered events do (services/socket.ts). An edit with none in this long is
 * taken as refused with NO_ANSWER_MESSAGE: a server past its budget of events
 * a socket may send drops one unanswered.
 */
export const WALL_LIGHT_ANSWER_TIMEOUT_MS = 10_000;
export const NO_ANSWER_MESSAGE = "That change didn't reach the table. Check your connection and try again.";

/**
 * The acknowledgement to send a wall or light edit with: it hands `handle`
 * the server's answer, or a refusal saying NO_ANSWER_MESSAGE once `ms` has
 * passed with none, whichever comes first, and nothing after that.
 */
export function answeredWithin(ms: number, handle: (reply: unknown) => void): (reply: unknown) => void {
  let done = false;
  const timer = setTimeout(() => {
    done = true;
    handle({ ok: false, error: NO_ANSWER_MESSAGE });
  }, ms);
  return (reply) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    handle(reply);
  };
}

/**
 * The reason in the server's answer to a wall or light edit, when the
 * answer refuses it, `{ ok: false, error }`; null for anything else.
 */
export function refusalIn(reply: unknown): string | null {
  if (typeof reply !== 'object' || reply === null) return null;
  if (!('ok' in reply) || reply.ok !== false) return null;
  return 'error' in reply && typeof reply.error === 'string' ? reply.error : 'The server refused the change.';
}

/**
 * The wall edits the page has sent on the map on screen and how the server
 * answered them, so a refusal is taken back only when the server does not
 * hold the change after all. Every bulk list the page sends (walls:replace)
 * is built from the walls on the page, so it carries each earlier edit not
 * yet taken back: once a later list is stored, the server holds that edit,
 * refused or not. A refusal is held while a later list is unanswered,
 * dropped once one is stored, and taken back once none can be.
 */
export class WallSendLog {
  private next = 0;
  private readonly unanswered = new Set<number>();
  /** The lists sent, by number, until nothing earlier can still need them. */
  private readonly lists = new Map<number, 'sent' | 'stored'>();
  private held: Array<{ seq: number; takeBack: () => void }> = [];

  /** Number an edit as it is sent; `list` for a whole list of walls. */
  sent(list: boolean): number {
    this.next += 1;
    this.unanswered.add(this.next);
    if (list) this.lists.set(this.next, 'sent');
    return this.next;
  }

  /** The server stored edit `seq`. */
  stored(seq: number): void {
    this.unanswered.delete(seq);
    if (this.lists.has(seq)) this.lists.set(seq, 'stored');
    this.settle();
  }

  /** The server refused edit `seq`; `takeBack` undoes it on the page when that is still right. */
  refused(seq: number, takeBack: () => void): void {
    this.unanswered.delete(seq);
    this.lists.delete(seq);
    this.held.push({ seq, takeBack });
    this.settle();
  }

  /** A new map: nothing sent on the last one counts any more. */
  reset(): void {
    this.unanswered.clear();
    this.lists.clear();
    this.held = [];
  }

  private settle(): void {
    const due: Array<{ seq: number; takeBack: () => void }> = [];
    this.held = this.held.filter((edit) => {
      const later = [...this.lists].filter(([seq]) => seq > edit.seq).map(([, state]) => state);
      if (later.includes('stored')) return false;
      if (later.includes('sent')) return true;
      due.push(edit);
      return false;
    });
    // The newest first, so each is taken back from the walls as they stood
    // after it.
    for (const edit of due.sort((a, b) => b.seq - a.seq)) edit.takeBack();
    // A list matters only to an edit sent before it that may still be refused.
    const oldest = Math.min(...this.unanswered, ...this.held.map((edit) => edit.seq));
    for (const seq of this.lists.keys()) if (seq < oldest) this.lists.delete(seq);
  }
}
