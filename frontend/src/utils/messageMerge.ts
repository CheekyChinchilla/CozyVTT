import type { Message } from '@/types';

/**
 * Fold a page of chat history into what is already on screen.
 *
 * History pages backwards, so an older page arrives after the messages it comes
 * before and cannot simply be prepended — a page that overlaps what is loaded
 * would show its messages twice, with duplicate React keys behind them.
 *
 * Ordering mirrors the server's exactly, reversed. The server sends newest
 * first, ordered by `createdAt` then `id`; the panel reads oldest first, so this
 * is ascending on both. Sorting on the timestamp alone would let two messages
 * sharing a millisecond swap places depending on whether they arrived live or
 * were paged in.
 *
 * Where an id appears in both, the incoming copy wins: it came from the server,
 * and the one on screen may be an optimistic echo.
 */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);

  return [...byId.values()].sort((a, b) => {
    const at = Date.parse(a.createdAt);
    const bt = Date.parse(b.createdAt);
    if (at !== bt) return at - bt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
