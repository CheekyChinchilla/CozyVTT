import type { Prisma } from '@prisma/client';
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
 */

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
