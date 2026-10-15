import crypto from 'crypto';
import type { PasswordResetToken, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * Password-reset and invitation links.
 *
 * Both are rows in `PasswordResetToken`, and either one lets whoever holds it
 * set the account's password. An unused link therefore has to stop working
 * once the password it would set has been settled some other way: when a newer
 * link is issued, when another link is used, when the owner changes their
 * password, when an admin resets it, and when the account's email changes, so
 * a link sent to the old address cannot take the account back.
 *
 * The row holds SHA-256 of the token, not the token: the link in the email
 * carries the token itself, and a lookup hashes what it is given. Anyone who
 * reads the database or a backup then holds no working link. The token is 256
 * random bits, so a fast hash is right here; there is nothing to guess. Links
 * issued before this held the token as sent, a UUID, and keep working until
 * they expire: a UUID-shaped token whose hash finds nothing is looked up as it
 * is. Nothing else is, so the stored hash cannot be presented as the token.
 */

/** How long a password reset link works. */
export const RESET_LINK_TTL_MS = 60 * 60 * 1000;

/** The stored form of a token. */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const LEGACY_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Issue a link for a user: a new token, stored hashed. Returns the token to
 * put in the email; it is never stored and cannot be read back.
 */
export async function issueResetToken(
  userId: string,
  ttlMs: number,
  db: Prisma.TransactionClient = prisma
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await db.passwordResetToken.create({
    data: { userId, token: hashResetToken(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/**
 * The row a presented token names, used or not, expired or not; the caller
 * decides what to do with one that is spent. By hash first; a token in the
 * old plain form is then looked up as it is, so links sent before tokens were
 * hashed keep working until they expire.
 */
export async function findResetTokenRow(token: string): Promise<PasswordResetToken | null> {
  const hashed = await prisma.passwordResetToken.findUnique({ where: { token: hashResetToken(token) } });
  if (hashed) return hashed;
  if (!LEGACY_TOKEN.test(token)) return null;
  return prisma.passwordResetToken.findUnique({ where: { token } });
}

/**
 * Mark every unused link of a user as used. Pass the transaction client when
 * this has to land together with the change that makes the links stale.
 *
 * @returns how many links were voided
 */
export async function voidOutstandingResetLinks(
  userId: string,
  db: Prisma.TransactionClient = prisma
): Promise<number> {
  const { count } = await db.passwordResetToken.updateMany({
    where: { userId, used: false },
    data: { used: true },
  });
  return count;
}
