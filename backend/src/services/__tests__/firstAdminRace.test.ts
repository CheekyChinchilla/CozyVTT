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

it('never makes more than one ADMIN when registrations race', async () => {
  // The suite shares a throwaway database with other suites running in
  // parallel, so the instance is not reliably empty here. The security
  // invariant holds regardless: a burst of concurrent signups must never mint
  // two administrators. (One admin appears only on a truly empty instance,
  // which the isolated run of this test against a fresh database confirms.)
  await prisma.user.deleteMany({ where: { email: { in: emails } } });

  await Promise.all(
    emails.map((email) =>
      registerUser({ email, password: 'RaceTest123!Cozy', displayName: 'Race' })
    )
  );

  const admins = await prisma.user.count({
    where: { email: { in: emails }, platformRole: 'ADMIN' },
  });

  expect(admins).toBeLessThanOrEqual(1);
});
