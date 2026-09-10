/**
 * Folding a page of history into what is already on screen.
 *
 * Chat pages backwards, so an older page arrives after the messages it precedes
 * and has to be merged rather than prepended. Prepending blind is what produced
 * duplicate messages and duplicate React keys when "load more" refetched.
 *
 * The ordering matters more than it looks: the server sorts newest first by
 * (createdAt, id), and the panel reads oldest first. Sorting here by createdAt
 * alone would let two messages sent in the same millisecond swap places
 * depending on whether they arrived live or were paged in — invisible until two
 * people talk at once.
 */

import { describe, it, expect } from 'vitest';
import { mergeMessages } from '../messageMerge';
import type { Message } from '@/types';

const msg = (id: string, createdAt: string): Message =>
  ({ id, createdAt, content: id, type: 'PLAYER', campaignId: 'c', userId: 'u', metadata: null }) as unknown as Message;

describe('mergeMessages', () => {
  it('keeps oldest first', () => {
    const merged = mergeMessages([msg('b', '2026-01-01T00:00:02.000Z')], [msg('a', '2026-01-01T00:00:01.000Z')]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('drops a message the two pages share', () => {
    const existing = [msg('a', '2026-01-01T00:00:01.000Z'), msg('b', '2026-01-01T00:00:02.000Z')];
    const incoming = [msg('b', '2026-01-01T00:00:02.000Z'), msg('c', '2026-01-01T00:00:03.000Z')];
    const merged = mergeMessages(existing, incoming);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a tie by id, the reverse of how the server ordered it', () => {
    // Server sends newest first: (t, 'b') then (t, 'a'). Read oldest first,
    // that is 'a' then 'b'.
    const t = '2026-01-01T00:00:01.000Z';
    expect(mergeMessages([], [msg('b', t), msg('a', t)]).map((m) => m.id)).toEqual(['a', 'b']);
    expect(mergeMessages([msg('b', t)], [msg('a', t)]).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('is idempotent, so a page merged twice changes nothing', () => {
    const page = [msg('a', '2026-01-01T00:00:01.000Z'), msg('b', '2026-01-01T00:00:02.000Z')];
    const once = mergeMessages([], page);
    expect(mergeMessages(once, page)).toEqual(once);
  });

  it('keeps an optimistic message that has no server row yet', () => {
    const merged = mergeMessages(
      [msg('temp-1', '2026-01-01T00:00:09.000Z')],
      [msg('a', '2026-01-01T00:00:01.000Z')]
    );
    expect(merged.map((m) => m.id)).toEqual(['a', 'temp-1']);
  });

  it('prefers the server copy when an id arrives twice', () => {
    const stale = msg('a', '2026-01-01T00:00:01.000Z');
    const fresh = { ...msg('a', '2026-01-01T00:00:01.000Z'), content: 'edited' } as Message;
    expect(mergeMessages([stale], [fresh])[0].content).toBe('edited');
  });
});
