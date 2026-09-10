/**
 * messageCursor.ts
 * A position in a campaign's chat history, as an opaque string.
 *
 * Chat pages backwards by keyset rather than offset, so that messages arriving
 * at the head while someone scrolls back cannot shift the window under them.
 * The position is the pair `(createdAt, id)`: `createdAt` alone is not unique —
 * a dice roll and its system message can land in the same millisecond — and a
 * cursor built on it would either skip rows sharing a timestamp or repeat them
 * forever. Adding `id` makes the order total.
 *
 * The encoding is deliberately opaque. The client takes `nextCursor` out of one
 * response and hands it back on the next; it never builds one. That keeps the
 * ordering key a server-side fact, so a future third sort key changes nothing
 * on the client.
 *
 * ---------------------------------------------------------------------------
 * There is no signature here, and none is needed.
 * ---------------------------------------------------------------------------
 * A tampered cursor can only move the window *within a campaign the caller is
 * already a member of* — `campaignMember` and the `campaignId` in the query are
 * what authorise the read, not this string. It names a row; it does not grant
 * access to one. Do not add an HMAC on the assumption that it is doing security
 * work, and do not assume one is there.
 */

/** Longer than any real cursor; refuses a payload built to be expensive to parse. */
const MAX_CURSOR_LENGTH = 200;

const SEPARATOR = '|';

/** Mint the cursor for a row, to be handed back as `?cursor=`. */
export function encodeMessageCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}${SEPARATOR}${id}`).toString('base64url');
}

/**
 * Read a cursor back, or `null` if it is anything this module did not mint.
 *
 * Takes `unknown` because it is handed straight from `req.query`, where a
 * repeated parameter arrives as an array and anything at all can arrive as a
 * string. Callers answer 400 on `null` rather than silently paging from the
 * top, which would look to a reader like history that loops.
 */
export function decodeMessageCursor(raw: unknown): { createdAt: Date; id: string } | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_CURSOR_LENGTH) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(trimmed, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  // Split on the first separator only: the timestamp is fixed-width and cannot
  // contain one, so everything after it is the id, whatever it holds.
  const at = decoded.indexOf(SEPARATOR);
  if (at <= 0) return null;

  const timestamp = decoded.slice(0, at);
  const id = decoded.slice(at + 1);
  if (!id) return null;

  const createdAt = new Date(timestamp);
  // `new Date` accepts a great deal; require the exact round trip so that only
  // a value this module wrote is accepted back.
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== timestamp) return null;

  return { createdAt, id };
}
