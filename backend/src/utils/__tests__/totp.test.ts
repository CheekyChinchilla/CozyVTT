/**
 * Authenticator codes: the secrets already stored keep working, and a code is
 * six digits and nothing else.
 *
 * Every account with two-factor authentication on holds a secret made by the
 * library CozyVTT used before, and the authenticator app on the person's phone
 * was set up from it. A change of library that read those secrets differently
 * would lock every one of them out, so a secret made that way, with the codes
 * that library gave for it, is checked here as it is stored.
 */

import { verifyTotpOnce } from '../totp';

/**
 * A secret as CozyVTT stored it until now: twenty printable characters
 * ("kpb%dgmyn}AtG(u7nhuA"), written in base32. The codes are the ones the old
 * library gave for it, at STORED_AT and 30 and 60 seconds either side.
 */
const STORED_SECRET = 'NNYGEJLEM5WXS3T5IF2EOKDVG5XGQ5KB';
const STORED_AT = 1_760_000_000;
const STORED_CODES = { '-60': '789310', '-30': '559944', '0': '517213', '30': '058151', '60': '914209' };

/** RFC 6238's SHA-1 seed, "12345678901234567890", in base32, with its test vectors cut to six digits. */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RFC_VECTORS: [number, string][] = [
  [59, '287082'],
  [1_111_111_109, '081804'],
  [1_111_111_111, '050471'],
  [1_234_567_890, '005924'],
  [2_000_000_000, '279037'],
];

let user = 0;
/** A user id of its own for each check, so one check's accepted step does not refuse the next. */
const freshUser = () => `totp-test-${++user}`;

function at(seconds: number): void {
  jest.spyOn(Date, 'now').mockReturnValue(seconds * 1000);
}

afterEach(() => jest.restoreAllMocks());

describe('a secret stored before this library', () => {
  it('accepts the code the old library gave for this step', () => {
    at(STORED_AT);
    expect(verifyTotpOnce(freshUser(), STORED_SECRET, STORED_CODES['0'])).toBe(true);
  });

  it('accepts the codes for one step either side, for a phone whose clock is a little out', () => {
    at(STORED_AT);
    expect(verifyTotpOnce(freshUser(), STORED_SECRET, STORED_CODES['-30'])).toBe(true);
    expect(verifyTotpOnce(freshUser(), STORED_SECRET, STORED_CODES['30'])).toBe(true);
  });

  it('refuses the codes two steps away', () => {
    at(STORED_AT);
    expect(verifyTotpOnce(freshUser(), STORED_SECRET, STORED_CODES['-60'])).toBe(false);
    expect(verifyTotpOnce(freshUser(), STORED_SECRET, STORED_CODES['60'])).toBe(false);
  });
});

describe('the codes RFC 6238 gives', () => {
  it.each(RFC_VECTORS)('at %i seconds, accepts %s', (seconds, code) => {
    at(seconds);
    expect(verifyTotpOnce(freshUser(), RFC_SECRET, code)).toBe(true);
  });
});

describe('a code', () => {
  // 081804 is the right code at this moment; each of these has its digits
  // after a sign, a space or a letter, which a number parser reads as 81804.
  it.each(['81804x', ' 81804', '+81804', '81804 '])('is refused as %j, though a number parser reads it as the right code', (code) => {
    at(1_111_111_109);
    expect(verifyTotpOnce(freshUser(), RFC_SECRET, code)).toBe(false);
  });

  it.each(['', '08180', '0818044', 'abcdef'])('is refused, without an error, as %j', (code) => {
    at(1_111_111_109);
    expect(verifyTotpOnce(freshUser(), RFC_SECRET, code)).toBe(false);
  });

  it('is refused, without an error, against a stored secret that cannot be read', () => {
    at(1_111_111_109);
    expect(verifyTotpOnce(freshUser(), 'not a base32 secret!', '081804')).toBe(false);
  });
});
