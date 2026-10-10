/**
 * Reading an HTTP `Range` header for one file, following RFC 9110 section 14.
 *
 * One range is served. A header asking for several, in another unit, or not
 * well formed is ignored and the whole file is sent, which the RFC allows and
 * every media player copes with. Express's own `req.range()` would answer 416
 * for two cases the RFC says to serve: a malformed header, and a request for
 * more trailing bytes than the file has.
 */

export type ByteRange =
  /** Send the whole file: there is no Range header, or it is one ignored here. */
  | { kind: 'whole' }
  /** Nothing asked for is inside the file: answer 416 with the file's size. */
  | { kind: 'unsatisfiable' }
  /** Send bytes `start` to `end`, both included: answer 206. */
  | { kind: 'partial'; start: number; end: number };

/** `bytes=first-last`, either number optional. Linear: no nested repetition. */
const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/i;

export function parseByteRange(header: string | undefined, size: number): ByteRange {
  if (!header) return { kind: 'whole' };
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) return { kind: 'whole' };
  const [, first, last] = match;
  if (first === '' && last === '') return { kind: 'whole' };

  if (first === '') {
    // `bytes=-N`: the last N bytes, or the whole file when it is shorter.
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return { kind: 'unsatisfiable' };
    return { kind: 'partial', start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(first);
  // A last byte before the first makes the header invalid, so it is ignored.
  if (last !== '' && Number(last) < start) return { kind: 'whole' };
  if (start >= size) return { kind: 'unsatisfiable' };
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  return { kind: 'partial', start, end };
}
