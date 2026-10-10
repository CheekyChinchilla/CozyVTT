/**
 * The Range header reading behind audio streaming, case by case against
 * RFC 9110 section 14, for a 1,000-byte file.
 */

import { parseByteRange } from '../byteRange';

const SIZE = 1000;

describe('one byte range', () => {
  it.each([
    ['bytes=0-99', 0, 99],
    ['bytes=0-', 0, 999],
    ['bytes=10-', 10, 999],
    ['bytes=990-5000', 990, 999],
    ['bytes=999-999', 999, 999],
    ['bytes=-100', 900, 999],
    ['bytes=-1000', 0, 999],
    ['bytes=-5000', 0, 999],
    ['BYTES=0-9', 0, 9],
    ['bytes=0-99999999999999999999999', 0, 999],
  ])('%s is bytes %i to %i', (header, start, end) => {
    expect(parseByteRange(header, SIZE)).toEqual({ kind: 'partial', start, end });
  });
});

describe('a range outside the file', () => {
  it.each(['bytes=1000-', 'bytes=1000-1001', 'bytes=5000-', 'bytes=-0', 'bytes=99999999999999999999999-'])(
    '%s cannot be satisfied',
    (header) => {
      expect(parseByteRange(header, SIZE)).toEqual({ kind: 'unsatisfiable' });
    }
  );

  it('includes any range of an empty file', () => {
    expect(parseByteRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
    expect(parseByteRange('bytes=-10', 0)).toEqual({ kind: 'unsatisfiable' });
  });
});

describe('a header that is not one byte range', () => {
  it.each([undefined, '', 'bytes=', 'bytes=-', 'bytes=abc', 'bytes=1-2-3', 'items=0-5', 'bytes=5-2', 'bytes=0-1,5-6', 'bytes 0-5'])(
    '%p means the whole file',
    (header) => {
      expect(parseByteRange(header, SIZE)).toEqual({ kind: 'whole' });
    }
  );
});
