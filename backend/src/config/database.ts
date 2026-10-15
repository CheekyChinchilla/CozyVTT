import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from './prismaClient';

// Prisma Client singleton to prevent multiple instances
// See: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
//
// A test that needs the app to use a client of its own puts it on
// `global.prisma` before this file is first imported.

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
