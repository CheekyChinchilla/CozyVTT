import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.asset.updateMany({
    where: {
      type: 'AVATAR',
      scope: 'GLOBAL',
    },
    data: {
      scope: 'USER',
    },
  });
  console.log(`Migrated ${result.count} AVATAR assets from GLOBAL to USER scope.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
