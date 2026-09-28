import { prisma } from '../config/database';

/**
 * Keeping an instance administrable.
 *
 * An instance with no admin cannot be run: nobody can reach the admin panel,
 * setup refuses to run again once it has, and the first user only becomes admin
 * on an empty instance. So the last admin may not delete their own account or
 * lose the role until another admin exists.
 */

/** Whether no admin other than this user exists. */
export async function isOnlyAdmin(userId: string): Promise<boolean> {
  const others = await prisma.user.count({
    where: { platformRole: 'ADMIN', id: { not: userId } },
  });
  return others === 0;
}
