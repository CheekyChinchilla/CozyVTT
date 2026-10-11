import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * A check and the write it allows, made as one step.
 *
 * Some rules are about rows other than the one being written: an instance
 * keeps at least one administrator, a campaign has one DM. A request that
 * reads the other rows, decides, and then writes can be overtaken by another
 * request doing the same, and each write is allowed by a read the other
 * makes untrue: two administrators each removing their own role both see the
 * other and both go ahead, and the instance is left with none.
 *
 * Run inside a SERIALIZABLE transaction, PostgreSQL notices when two such
 * transactions could not have happened one after the other, and refuses one
 * of them (error 40001). That one is run again from the start, and this time
 * reads what the other wrote, so its check says no. Only transactions run
 * this way are checked against each other, so every path that can break one
 * of these rules has to use it. A transaction refused this many times in a
 * row has its error passed on.
 */
export const SERIALIZABLE_ATTEMPTS = 5;

/** Whether PostgreSQL refused a transaction for overlapping another, so it may be run again. */
export function isSerializationFailure(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  // P2034: "Transaction failed due to a write conflict or a deadlock".
  if (error.code === 'P2034') return true;
  // A raw query reports PostgreSQL's own code.
  const meta = error.meta as { code?: unknown } | undefined;
  return error.code === 'P2010' && (meta?.code === '40001' || meta?.code === '40P01');
}

export async function inSerializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt >= SERIALIZABLE_ATTEMPTS || !isSerializationFailure(error)) throw error;
      // A short, varied pause, so two that collided do not collide again.
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40 * attempt));
    }
  }
}
