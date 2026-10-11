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

it('runs one of two overlapping transactions again, and the second run sees the first one\'s write', async () => {
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
  expect(runs).toBe(3);
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
