/**
 * Finding where the history before a message begins, with only the server's
 * cursors to go on.
 *
 * The chat panel lets its oldest messages go past 400 and then holds no
 * cursor that starts where its list does. `cursorBefore` reads back from the
 * newest message until it reaches the oldest one held; the read that follows
 * must start with the very next older message, skipping none and repeating
 * none, wherever the pages happen to break.
 */

import { describe, it, expect } from 'vitest';
import { cursorBefore } from '../messageHistory';
import type { ReadHistoryPage } from '../messageHistory';
import type { Message, MessageHistoryPage } from '@/types';

/** Message n, sent n seconds in; ids sort as the times do. */
const msg = (n: number): Message =>
  ({ id: `m-${String(n).padStart(4, '0')}`, createdAt: new Date(Date.UTC(2026, 9, 28, 18, 0, n)).toISOString(), content: `Message ${n}`, type: 'PLAYER', campaignId: 'c', userId: 'u', metadata: null }) as unknown as Message;

/** A server holding the messages numbered, paging as the real one does; it records its reads. */
function server(numbers: number[]) {
  const newestFirst = numbers.map(msg).reverse();
  const reads: { limit: number; cursor?: string }[] = [];
  const read: ReadHistoryPage = async (limit, cursor) => {
    reads.push({ limit, cursor });
    if (limit < 1 || limit > 100) throw new Error('Limit must be between 1 and 100');
    const start = cursor === undefined ? 0 : newestFirst.findIndex((m) => `after:${m.id}` === cursor) + 1;
    if (start === 0 && cursor !== undefined) throw new Error('Invalid cursor');
    const messages = newestFirst.slice(start, start + limit);
    const hasMore = start + limit < newestFirst.length;
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
