import { PrismaClient } from '@prisma/client';

// Prisma Client singleton to prevent multiple instances
// See: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// TODO(logging): in production Prisma prints its own copy of every query
// error to stderr, which Docker keeps in the container log. A validation error
// quotes the query's arguments in full, so a client-supplied value of any size,
// or an email address, reaches that log unmasked and unclipped (a 3,000
// character id came out as a 6,000 character message). The caught error is
// also logged through utils/logger, which masks and clips it. Correct would be
// `log: [{ emit: 'event', level: 'error' }]` with a `$on('error')` that writes
// through the logger, or no Prisma error log in production.
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
