/**
 * MFA backup codes.
 *
 * Each code is eight characters drawn from a 32-character alphabet (ambiguous
 * I, O, 0 and 1 removed) built from eight random bytes, and stored hashed with
 * Argon2id through the same helpers passwords use. The earlier implementation
 * generated four random bytes — a 32-bit space — and stored an unsalted SHA-256
 * of it, which a leaked database reverses in well under a second with one
 * precomputed table. A backup code is a login credential and is hashed like one.
 */

import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../services/auth';
import { BACKUP_CODE_COUNT } from '../validators/accountLimits';

/** Ambiguous glyphs (I, O, 0, 1) are excluded so a written-down code is legible. */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Single-use codes, BACKUP_CODE_COUNT of them, each formatted `XXXX-XXXX` for readability. */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let j = 0; j < 8; j++) code += CHARSET[bytes[j] % CHARSET.length];
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/** Strip formatting so a code entered with or without its hyphen compares equal. */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[-\s]/g, '').toUpperCase();
}

/**
 * Hash codes for storage. Normalised first, so verification can be lenient.
 * One after another, so a request takes one place at a time in the server's
 * line of hashes (services/auth.ts): ten at once took ten, and two such
 * requests from one address held a third of the line. Only two hashes run at
 * once anyway, so this costs little time.
 */
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const hashed: string[] = [];
  for (const code of codes) hashed.push(await hashPassword(normalizeBackupCode(code)));
  return hashed;
}

/**
 * Find which stored hash a plaintext code matches, or -1 for none. The caller
 * removes the matched hash so the code cannot be used twice. A stored hash left
 * from the old SHA-256 scheme is not Argon2 and simply never matches, which is
 * the forced regeneration: a user's old codes stop working on upgrade.
 */
export async function verifyBackupCode(plainCode: string, hashedCodes: string[]): Promise<number> {
  const normalized = normalizeBackupCode(plainCode);
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await verifyPassword(hashedCodes[i], normalized)) return i;
  }
  return -1;
}
