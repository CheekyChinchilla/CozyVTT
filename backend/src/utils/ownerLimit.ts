import type { Prisma } from '@prisma/client';

/**
 * Hold one owner's creates of one kind in line until the transaction ends.
 *
 * A ceiling on how many of something one account may own is a count and then
 * a create. Two requests sent together would each count the same number and
 * both create, so a script sending many at once could pass the ceiling by as
 * many as it sent. Taking this lock first, inside the transaction that counts
 * and creates, makes each request count what the one before it wrote.
 */
export async function holdOwnerCreates(tx: Prisma.TransactionClient, kind: string, ownerId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${kind}), hashtext(${ownerId}))`;
}
