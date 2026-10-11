import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * Keeping an instance administrable.
 *
 * An instance with no admin cannot be run: nobody can reach the admin panel,
 * setup refuses to run again once it has, and the first user only becomes admin
 * on an empty instance. So the last admin may not delete their own account or
 * lose the role until another admin exists.
 *
 * Two admins removed at the same moment would each see the other, so every
 * path that takes an admin away asks this inside the same serializable
 * transaction as its write (utils/serializable.ts): a demotion, an account
 * deleting itself, and an admin deleting another.
 */

/** Whether no admin other than this user exists. */
export async function isOnlyAdmin(userId: string, db: Prisma.TransactionClient = prisma): Promise<boolean> {
  const others = await db.user.count({
    where: { platformRole: 'ADMIN', id: { not: userId } },
  });
  return others === 0;
}
