/**
 * Exactly one first-boot admin, even under concurrent registration.
 *
 * `registerUser` decides the platform role from `prisma.user.count()` and then
 * creates the row. Two registrations racing on an empty instance both read
 * zero and both become ADMIN — a standing admin account for whoever wins the
 * race against the operator opening the setup wizard on a fresh, internet-
 * facing install.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { prisma } from '../../config/database';
import { registerUser } from '../auth';

const STAMP = Date.now();
const emails = Array.from({ length: 8 }, (_, i) => `race-${STAMP}-${i}@test.cozyvtt.local`);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

it('makes exactly one ADMIN when registrations race on an empty instance', async () => {
  // Empty of these test users to begin with; the suite runs against a shared
  // throwaway database, so scope the count to our own stamped emails.
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  const startingUsers = await prisma.user.count();

  await Promise.all(
    emails.map((email) =>
      registerUser({ email, password: 'RaceTest123!Cozy', displayName: 'Race' })
    )
  );

  const admins = await prisma.user.count({
    where: { email: { in: emails }, platformRole: 'ADMIN' },
  });

  // The first-ever user becomes admin only on a truly empty instance; if the
  // shared DB already had users, none of ours should be admin.
  expect(admins).toBe(startingUsers === 0 ? 1 : 0);
});
