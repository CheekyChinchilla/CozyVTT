/**
 * Move AVATAR assets from GLOBAL to USER scope, for instances that stored
 * avatars before they were personal.
 *
 *   npm run migrate:avatar-scope
 *
 * Safe to run again: an avatar already at USER scope is not touched. Exits 1
 * if the run fails.
 */

// Loads backend/.env, which the database client does not read itself.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../config/prismaClient';

export async function migrateAvatarScope(prisma: PrismaClient): Promise<number> {
  const result = await prisma.asset.updateMany({
    where: {
      type: 'AVATAR',
      scope: 'GLOBAL',
    },
    data: {
      scope: 'USER',
    },
  });
  return result.count;
}

// Only run when invoked directly, so importing this does not change anything.
if (require.main === module) {
  const prisma = createPrismaClient();
  migrateAvatarScope(prisma)
    .then((count) => console.log(`Migrated ${count} AVATAR assets from GLOBAL to USER scope.`))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
