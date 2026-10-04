import { generateBackupCodes, normalizeBackupCode, hashBackupCodes, verifyBackupCode } from '../backupCodes';

describe('generateBackupCodes', () => {
  it('makes ten codes formatted XXXX-XXXX', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('excludes the ambiguous glyphs I, O, 0 and 1', () => {
    const joined = generateBackupCodes(50).join('');
    expect(joined).not.toMatch(/[IO01]/);
  });

  it('does not repeat a code within a set', () => {
    const codes = generateBackupCodes(50);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('hashing and verifying', () => {
  it('stores Argon2 hashes, not the plaintext', async () => {
    const [code] = generateBackupCodes(1);
    const [hash] = await hashBackupCodes([code]);
    expect(hash).toMatch(/^\$argon2/);
    expect(hash).not.toContain(normalizeBackupCode(code));
  });

  it('matches a code regardless of case and hyphen', async () => {
    const codes = generateBackupCodes(3);
    const hashes = await hashBackupCodes(codes);
    const raw = codes[1];
    expect(await verifyBackupCode(raw, hashes)).toBe(1);
    expect(await verifyBackupCode(raw.toLowerCase(), hashes)).toBe(1);
    expect(await verifyBackupCode(raw.replace('-', ''), hashes)).toBe(1);
  });

  it('returns -1 for a code that is not stored', async () => {
    const hashes = await hashBackupCodes(generateBackupCodes(3));
    expect(await verifyBackupCode('ZZZZ-ZZZZ', hashes)).toBe(-1);
  });

  it('never matches a leftover SHA-256 hash from the old scheme', async () => {
    const crypto = await import('crypto');
    const legacy = crypto.createHash('sha256').update('ABCD2345').digest('hex');
    expect(await verifyBackupCode('ABCD-2345', [legacy])).toBe(-1);
  });
});
