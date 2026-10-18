/**
 * inSerializableTransaction runs a check and its write as one step: of two
 * that overlap, PostgreSQL refuses one, which runs again and sees what the
 * other wrote.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { prisma as appPrisma } from '../../config/database';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { inSerializableTransaction, isSerializationFailure } from '../serializable';

const created: string[] = [];

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
  await appPrisma.$disconnect();
});

it('runs again a transaction PostgreSQL refuses at COMMIT, and the second run sees the first one\'s write', async () => {
  const a = await createTestUser({ role: 'ADMIN' });
  const b = await createTestUser({ role: 'ADMIN' });
  created.push(a.id, b.id);

  // Both first runs read before either writes, the way two requests overlap.
  let runs = 0;
  let arrived = 0;
  let release: () => void = () => undefined;
  const bothRead = new Promise<void>((resolve) => { release = resolve; });

  const stepDown = (self: string, other: string) =>
    inSerializableTransaction(async (tx) => {
      runs += 1;
      const first = runs <= 2;
      const otherAdmins = await tx.user.count({ where: { id: other, platformRole: 'ADMIN' } });
      if (first) {
        arrived += 1;
        if (arrived === 2) release();
        await bothRead;
      }
      if (otherAdmins === 0) return 'refused';
      await tx.user.update({ where: { id: self }, data: { platformRole: 'USER' } });
      return 'stepped down';
    });

  const outcomes = await Promise.all([stepDown(a.id, b.id), stepDown(b.id, a.id)]);

  expect(outcomes.sort()).toEqual(['refused', 'stepped down']);
  // At least one run again. PostgreSQL may refuse a retry as well, or both
  // first runs, when another test file writes users at the same moment (its
  // conflict checks are not exact), so a full parallel run can take more.
  expect(runs).toBeGreaterThanOrEqual(3);
  expect(await prisma.user.count({ where: { id: { in: [a.id, b.id] }, platformRole: 'ADMIN' } })).toBe(1);
});

it.each([
  ['a raw statement', 'raw'],
  ['a query Prisma builds', 'model'],
] as const)('runs again a transaction when PostgreSQL refuses %s inside it for overlapping another', async (_label, kind) => {
  const a = await createTestUser({ role: 'ADMIN' });
  const b = await createTestUser({ role: 'ADMIN' });
  created.push(a.id, b.id);

  // Both read, then the first writes and commits, and only then does the
  // second write: PostgreSQL refuses that write itself, before any COMMIT.
  let runs = 0;
  let arrived = 0;
  let release: () => void = () => undefined;
  const bothRead = new Promise<void>((resolve) => { release = resolve; });
  let firstDone: () => void = () => undefined;
  const firstCommitted = new Promise<void>((resolve) => { firstDone = resolve; });

  const stepDown = (self: string, other: string, waitForTheOther: boolean) =>
    inSerializableTransaction(async (tx) => {
      runs += 1;
      const first = runs <= 2;
      const otherAdmins = kind === 'raw'
        ? Number((await tx.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM "User" WHERE "id" = ${other} AND "platformRole" = 'ADMIN'`)[0].n)
        : await tx.user.count({ where: { id: other, platformRole: 'ADMIN' } });
      if (first) {
        arrived += 1;
        if (arrived === 2) release();
        await bothRead;
        if (waitForTheOther) await firstCommitted;
      }
      if (otherAdmins === 0) return 'refused';
      if (kind === 'raw') await tx.$executeRaw`UPDATE "User" SET "platformRole" = 'USER' WHERE "id" = ${self}`;
      else await tx.user.update({ where: { id: self }, data: { platformRole: 'USER' } });
      return 'stepped down';
    });

  const firstRun = stepDown(a.id, b.id, false).finally(() => firstDone());
  const outcomes = await Promise.all([firstRun, stepDown(b.id, a.id, true)]);

  expect(outcomes.sort()).toEqual(['refused', 'stepped down']);
  expect(runs).toBeGreaterThanOrEqual(3); // more under load, as above
  expect(await prisma.user.count({ where: { id: { in: [a.id, b.id] }, platformRole: 'ADMIN' } })).toBe(1);
});

it('passes on an error that is not a refusal for overlapping, without running again', async () => {
  let runs = 0;
  await expect(
    inSerializableTransaction(async () => {
      runs += 1;
      throw new Error('not a conflict');
    })
  ).rejects.toThrow('not a conflict');
  expect(runs).toBe(1);
  expect(isSerializationFailure(new Error('could not serialize access'))).toBe(false);
});

it('reads a refusal from the driver adapter\'s error, and nothing else it reports', () => {
  const driverError = (cause: Record<string, unknown>) => Object.assign(new Error('driver'), { name: 'DriverAdapterError', cause });
  expect(isSerializationFailure(driverError({ kind: 'TransactionWriteConflict', originalCode: '40001' }))).toBe(true);
  expect(isSerializationFailure(driverError({ kind: 'TransactionWriteConflict', originalCode: '40P01' }))).toBe(true);
  expect(isSerializationFailure(driverError({ kind: 'UniqueConstraintViolation', originalCode: '23505' }))).toBe(false);
  expect(isSerializationFailure(driverError({ kind: 'DatabaseNotReachable' }))).toBe(false);
  expect(isSerializationFailure({ name: 'DriverAdapterError' })).toBe(false);
});
