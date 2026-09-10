/**
 * A position in a campaign's chat history.
 *
 * Chat pages backwards by keyset rather than offset, so the client has to hand
 * back where it got to. `createdAt` alone cannot do that: it is not unique, and
 * a cursor built on it either skips rows sharing a millisecond or repeats them
 * forever. The pair `(createdAt, id)` is a total order, and the cursor carries
 * both.
 *
 * `Message.createdAt` is `TIMESTAMP(3)`, which is exactly the precision an ISO
 * string holds — so the round trip below is lossless rather than lucky. If that
 * column ever gained precision, this test is what would notice.
 */

import { encodeMessageCursor, decodeMessageCursor } from '../messageCursor';

describe('message cursors', () => {
  const id = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

  it('round-trips a position, milliseconds and all', () => {
    const createdAt = new Date('2026-09-10T01:23:45.678Z');
    const decoded = decodeMessageCursor(encodeMessageCursor(createdAt, id));
    expect(decoded).not.toBeNull();
    expect(decoded!.createdAt.toISOString()).toBe('2026-09-10T01:23:45.678Z');
    expect(decoded!.createdAt.getTime()).toBe(createdAt.getTime());
    expect(decoded!.id).toBe(id);
  });

  it('survives a trip through a URL, which is how it actually travels', () => {
    const cursor = encodeMessageCursor(new Date('2026-01-02T03:04:05.006Z'), id);
    expect(cursor).toBe(encodeURIComponent(cursor));
  });

  it('refuses anything it did not mint', () => {
    for (const bad of [
      '',
      '   ',
      'not-base64!!',
      Buffer.from('no-separator').toString('base64url'),
      Buffer.from('2026-09-10T01:23:45.678Z').toString('base64url'),
      Buffer.from(`not-a-date|${id}`).toString('base64url'),
      Buffer.from(`2026-09-10T01:23:45.678Z|`).toString('base64url'),
      Buffer.from(`|${id}`).toString('base64url'),
      Buffer.from('a'.repeat(500)).toString('base64url'),
    ]) {
      expect(decodeMessageCursor(bad)).toBeNull();
    }
  });

  it('refuses a value that is not a string at all', () => {
    for (const bad of [undefined, null, 42, {}, [], true]) {
      expect(decodeMessageCursor(bad)).toBeNull();
    }
  });

  it('splits on the first separator only, so an id containing one cannot truncate a date', () => {
    // uuids never contain "|". This pins the parse rule rather than trusting that.
    const cursor = Buffer.from(`2026-09-10T01:23:45.678Z|a|b`).toString('base64url');
    const decoded = decodeMessageCursor(cursor);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe('a|b');
  });
});
