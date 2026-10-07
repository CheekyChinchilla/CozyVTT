import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

// Prisma Client singleton to prevent multiple instances
// See: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Prisma's errors and warnings go through the project logger, never straight
 * to the terminal. A validation error quotes the query's arguments in full, a
 * value a client sent among them, and the logger is what masks email
 * addresses and clips a value of absurd length. `target` names the model and
 * operation (`character.findUnique`); the error a caller catches carries the
 * code and is logged where it is caught. Development also prints each query.
 */
function createClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      ...(process.env.NODE_ENV === 'development' ? [{ emit: 'stdout' as const, level: 'query' as const }] : []),
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });
  client.$on('error', (e) => logger.error('Database error', { target: e.target, detail: e.message }));
  client.$on('warn', (e) => logger.warn('Database warning', { target: e.target, detail: e.message }));
  return client;
}

export const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
