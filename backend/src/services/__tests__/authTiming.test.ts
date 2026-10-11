/**
 * Signing in with an email that has no account takes as long as a wrong password.
 *
 * The reply is the same in both cases, but an unknown email returned straight
 * after the account lookup while a known one went on to the Argon2 check, so
 * the time an attempt took told which addresses have accounts. An unknown
 * email is now checked against a fixed dummy hash, so both paths pay for the
 * hash.
 *
 * Timing tests are noisy, so this compares medians over several attempts and
 * asks only that the unknown-email path take at least half as long as the
 * known-email path: before the fix it took a few milliseconds against tens.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { prisma, createTestUser, cleanupUsers, testEmail } from '../../__tests__/helpers/db';
import { authenticateUser } from '../auth';

jest.setTimeout(120000);

const created: string[] = [];

async function median(times: number, run: () => Promise<unknown>): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < times; i += 1) {
    const start = process.hrtime.bigint();
    await run();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('takes as long for an email with no account as for a wrong password', async () => {
  const user = await createTestUser({ displayName: 'Timing' });
  created.push(user.id);
  const nobody = testEmail('nobody');

  // Warm both paths once, so neither pays a first-call cost in the samples.
  expect(await authenticateUser({ email: user.email, password: 'wrong-password' })).toBeNull();
  expect(await authenticateUser({ email: nobody, password: 'wrong-password' })).toBeNull();

  const known = await median(7, () => authenticateUser({ email: user.email, password: 'wrong-password' }));
  const unknown = await median(7, () => authenticateUser({ email: nobody, password: 'wrong-password' }));

  // Both run the hash, which is the slow part; the difference left is one
  // database read either way.
  expect(unknown).toBeGreaterThan(known * 0.5);
});
