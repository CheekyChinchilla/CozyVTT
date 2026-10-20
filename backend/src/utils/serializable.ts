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

/** PostgreSQL's codes for a transaction refused for overlapping another: a serialization failure, a deadlock. */
const CONFLICT_CODES = ['40001', '40P01'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Whether an error from the pg driver adapter says PostgreSQL refused the
 * transaction. The adapter names the refusal `TransactionWriteConflict` and
 * keeps PostgreSQL's own code beside it.
 */
function isDriverConflict(error: unknown): boolean {
  if (!isRecord(error) || error.name !== 'DriverAdapterError' || !isRecord(error.cause)) return false;
  const { kind, originalCode } = error.cause;
  return kind === 'TransactionWriteConflict' || (typeof originalCode === 'string' && CONFLICT_CODES.includes(originalCode));
}

/**
 * Whether PostgreSQL refused a transaction for overlapping another, so it may
 * be run again. The refusal arrives in one of three forms: P2034 from a
 * query Prisma built; P2010 from a raw query, carrying the driver's error;
 * and, when it comes at COMMIT, the driver's error itself.
 */
export function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: "Transaction failed due to a write conflict or a deadlock".
    if (error.code === 'P2034') return true;
    return error.code === 'P2010' && isRecord(error.meta) && isDriverConflict(error.meta.driverAdapterError);
  }
  return isDriverConflict(error);
}

/**
 * `timeout` and `maxWait` are Prisma's: how long the transaction may run
 * (five seconds unless set) and how long it may wait for a connection (two).
 */
export async function inSerializableTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeout?: number; maxWait?: number } = {}
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(work, { ...options, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt >= SERIALIZABLE_ATTEMPTS || !isSerializationFailure(error)) throw error;
      // A short, varied pause, so two that collided do not collide again.
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40 * attempt));
    }
  }
}
