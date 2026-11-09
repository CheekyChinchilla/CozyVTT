/**
 * Finding where the history before a message begins, with only the server's
 * cursors to go on.
 *
 * The chat panel lets its oldest messages go past 400 and then holds no
 * cursor that starts where its list does. `cursorBefore` reads back from the
 * newest message until it reaches the oldest one held; the read that follows
 * must start with the very next older message, skipping none and repeating
 * none, wherever the pages happen to break; and while messages are deleted
 * and sent between its reads, still skipping none.
 */

import { describe, it, expect } from 'vitest';
import { cursorBefore } from '../messageHistory';
import type { ReadHistoryPage } from '../messageHistory';
import type { Message, MessageHistoryPage } from '@/types';

/** Message n, sent n seconds in; ids sort as the times do. */
const msg = (n: number): Message =>
  ({ id: `m-${String(n).padStart(4, '0')}`, createdAt: new Date(Date.UTC(2026, 9, 28, 18, 0, n)).toISOString(), content: `Message ${n}`, type: 'PLAYER', campaignId: 'c', userId: 'u', metadata: null }) as unknown as Message;

/** What the server holds, changed between reads: a message deleted, or a new one sent. */
interface Held {
  remove: (...numbers: number[]) => void;
  add: (n: number) => void;
}

/**
 * A server holding the messages numbered, paging as the real one does: a
 * cursor names a position, and a page holds what is older than it, so a
 * cursor stays good after its message is deleted. It records its reads, and
 * `before` runs ahead of each, numbered from 1, to change what it holds.
 */
function server(numbers: number[], before?: (read: number, held: Held) => void) {
  let newestFirst = numbers.map(msg).reverse();
  const held: Held = {
    remove: (...gone) => { newestFirst = newestFirst.filter((m) => !gone.map((n) => msg(n).id).includes(m.id)); },
    add: (n) => { newestFirst = [msg(n), ...newestFirst]; },
  };
  const reads: { limit: number; cursor?: string }[] = [];
  const read: ReadHistoryPage = async (limit, cursor) => {
    reads.push({ limit, cursor });
    before?.(reads.length, held);
    if (limit < 1 || limit > 100) throw new Error('Limit must be between 1 and 100');
    if (cursor !== undefined && !cursor.startsWith('after:')) throw new Error('Invalid cursor');
    const older = cursor === undefined ? newestFirst : newestFirst.filter((m) => m.id < cursor.slice('after:'.length));
    const messages = older.slice(0, limit);
    const hasMore = older.length > limit;
    const page: MessageHistoryPage = { messages, pagination: { limit, hasMore, nextCursor: hasMore ? `after:${messages[messages.length - 1].id}` : null } };
    return page;
  };
  /** The messages a cursor reads next, newest first. */
  const next = async (found: { cursor?: string } | null) => (found ? (await read(50, found.cursor)).messages.map((m) => m.content) : []);
  return { read, reads, next };
}
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('cursorBefore', () => {
  it('reads a page again when the message falls inside it', async () => {
    const { read, reads, next } = server(upTo(500));
    const found = await cursorBefore(read, msg(330));
    expect(reads.map((r) => r.limit)).toEqual([100, 100, 71]);
    expect((await next(found)).slice(0, 2)).toEqual(['Message 329', 'Message 328']);
  });

  it('stops at the end of a page when the message closes it', async () => {
    const { read, reads, next } = server(upTo(500));
    const found = await cursorBefore(read, msg(301));
    expect(reads).toHaveLength(2);
    expect((await next(found))[0]).toBe('Message 300');
  });

  it('starts at the next older message when the server no longer has this one', async () => {
    const { read, next } = server(upTo(500).filter((n) => n !== 250));
    expect((await next(await cursorBefore(read, msg(250))))[0]).toBe('Message 249');
    const { read: readAtEdge, next: nextAtEdge } = server(upTo(500).filter((n) => n !== 401));
    expect((await nextAtEdge(await cursorBefore(readAtEdge, msg(401))))[0]).toBe('Message 400');
  });

  // Reading back to message 330 of 500 takes two pages, 500 to 401 and 400 to
  // 301; the third read is the second page again, asking for the 71 messages
  // from 400 to 330. It goes by count, so a message gone from that run before
  // it ends it one further on, at 329.

  it('reads the page again when a message after this one is deleted between the two reads', async () => {
    const { read, reads, next } = server(upTo(500), (n, held) => { if (n === 3) held.remove(350); });
    const found = await cursorBefore(read, msg(330));
    const limits = reads.map((r) => r.limit);
    expect((await next(found)).slice(0, 2)).toEqual(['Message 329', 'Message 328']);
    expect(limits).toEqual([100, 100, 71, 70]);
  });

  it('reads the page again when this message itself is deleted between the two reads', async () => {
    const { read, next } = server(upTo(500), (n, held) => { if (n === 3) held.remove(330); });
    expect((await next(await cursorBefore(read, msg(330)))).slice(0, 2)).toEqual(['Message 329', 'Message 328']);
  });

  // Read from the newest, the page shifts the other way too: a message sent
  // between the reads leads the second one, which then ends one sooner.

  it('repeats a message, and skips none, when a new one arrives between the two reads of the newest page', async () => {
    const { read, reads, next } = server(upTo(150), (n, held) => { if (n === 2) held.add(151); });
    const found = await cursorBefore(read, msg(120));
    expect(reads.map((r) => r.limit)).toEqual([100, 31]);
    // Message 120 is held already, and the merge keeps one copy.
    expect((await next(found)).slice(0, 2)).toEqual(['Message 120', 'Message 119']);
  });

  it('finds the next older message when one arrives and two are deleted between the reads', async () => {
    const { read, next } = server(upTo(150), (n, held) => {
      if (n !== 2) return;
      held.add(151);
      held.remove(130, 125);
    });
    expect((await next(await cursorBefore(read, msg(120)))).slice(0, 2)).toEqual(['Message 119', 'Message 118']);
  });

  it('gives up after three tries and starts the page over, repeating messages and skipping none', async () => {
    // One message from the run is deleted ahead of every read again.
    const { read, reads } = server(upTo(500), (n, held) => { if (n >= 3) held.remove(403 - n); });
    const found = await cursorBefore(read, msg(330));
    const limits = reads.map((r) => r.limit);
    const older = (await read(100, found?.cursor)).messages.filter((m) => m.id < msg(330).id);
    expect(older[0].content).toBe('Message 329');
    expect(found).toEqual({ cursor: 'after:m-0401' });
    expect(limits).toEqual([100, 100, 71, 70, 69]);
  });

  it('reads from the newest when everything the server has is older', async () => {
    const { read } = server(upTo(20));
    expect(await cursorBefore(read, msg(30))).toEqual({ cursor: undefined });
    expect(await cursorBefore(server([]).read, msg(1))).toEqual({ cursor: undefined });
  });

  it('says so when nothing is older', async () => {
    expect(await cursorBefore(server(upTo(500)).read, msg(1))).toBeNull();
    expect(await cursorBefore(server(upTo(100)).read, msg(1))).toBeNull();
  });

  it('finds the very next older message inside a run sharing one millisecond, at every boundary', async () => {
    // Seven messages to a millisecond, as a burst of system messages lands,
    // with uuid-shaped ids out of time order: the server orders by time,
    // then by id, and so must the walk.
    const hex = (n: number) => n.toString(16).padStart(8, '0');
    const all = Array.from({ length: 700 }, (_, i) => ({
      id: `${hex((i * 2654435761) % 4294967296)}-0000-4000-8000-${String(i).padStart(12, '0')}`,
      createdAt: new Date(Date.UTC(2026, 9, 28, 18, 0, 0) + Math.floor(i / 7)).toISOString(),
      content: `M${i}`, type: 'PLAYER', campaignId: 'c', userId: 'u', metadata: null,
    }) as unknown as Message);
    const newestFirst = [...all].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    const serve = (): ReadHistoryPage => async (limit, cursor) => {
      const older = cursor === undefined ? newestFirst : newestFirst.slice(newestFirst.findIndex((m) => m.id === cursor) + 1);
      const messages = older.slice(0, limit);
      const hasMore = older.length > limit;
      return { messages, pagination: { limit, hasMore, nextCursor: hasMore ? messages[messages.length - 1].id : null } };
    };

    for (let k = 1; k < newestFirst.length - 1; k++) {
      const found = await cursorBefore(serve(), newestFirst[k]);
      const next = await serve()(1, found?.cursor);
      expect(next.messages[0]?.id).toBe(newestFirst[k + 1].id);
    }
    expect(await cursorBefore(serve(), newestFirst[newestFirst.length - 1])).toBeNull();
  });
});
