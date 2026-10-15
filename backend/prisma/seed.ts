// Loads backend/.env, which the database client does not read itself.
import 'dotenv/config';
import { createPrismaClient } from '../src/config/prismaClient';

const prisma = createPrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed script will be implemented when needed
  // This file is a placeholder for future development

  console.log('✅ Database seeding complete');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
