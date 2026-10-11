import { Prisma, type LogLevel } from '@prisma/client';
import { prisma } from '../config/database';
import logger from '../utils/logger';

/**
 * The admins' activity log (the SystemLog table, shown on the Admin Panel's
 * Activity tab).
 *
 * Admin actions are written here with the admin's id. Events the instance
 * notices by itself, such as an account locked for too many wrong passwords,
 * are written with no user. A failure to write is logged and swallowed: the
 * action being recorded has already happened and must not fail for it.
 */
export async function writeSystemLog(entry: {
  level: LogLevel;
  message: string;
  userId?: string | null;
  context?: Prisma.InputJsonObject;
}): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        level: entry.level,
        message: entry.message,
        userId: entry.userId ?? null,
        context: entry.context ?? Prisma.JsonNull,
      },
    });
  } catch (e) {
    logger.error('Failed to write system log', { err: e });
  }
}
