/**
 * Signing in with an email that has no account takes as long as a wrong password.
 *
 * The reply is the same in both cases, but an unknown email returned straight
 * after the account lookup while a known one went on to the Argon2 check, so
 * the time an attempt took told which addresses have accounts. An unknown
 * email is now checked against a fixed dummy hash, so both paths pay for the
 * hash.
 *
 * What an attempt costs is the Argon2 check, and that cost is set by the
 * hash's parameters. So this asks that each path runs the check exactly once,
 * against hashes made with the same parameters. Comparing times instead
 * failed now and then on a busy machine.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import argon2 from 'argon2';
import { prisma, createTestUser, cleanupUsers, testEmail } from '../../__tests__/helpers/db';
import { authenticateUser } from '../auth';

const created: string[] = [];

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** `$argon2id$v=19$m=65536,t=3,p=4`: the algorithm, version and costs, without the salt and the hash. */
function parameters(hash: string): string {
  return hash.split('$').slice(0, 4).join('$');
}

/** The hashes Argon2 checked a password against while `run` ran. */
async function hashesChecked(run: () => Promise<unknown>): Promise<string[]> {
  const verify = jest.spyOn(argon2, 'verify');
  try {
    await run();
    return verify.mock.calls.map((call) => call[0]);
  } finally {
    verify.mockRestore();
  }
}

it('checks the password once against a hash of the same cost, whether or not the email has an account', async () => {
  const user = await createTestUser({ displayName: 'Timing' });
  created.push(user.id);

  const known = await hashesChecked(async () => {
    expect(await authenticateUser({ email: user.email, password: 'wrong-password' })).toBeNull();
  });
  const unknown = await hashesChecked(async () => {
    expect(await authenticateUser({ email: testEmail('nobody'), password: 'wrong-password' })).toBeNull();
  });

  expect(known).toEqual([user.passwordHash]);
  expect(unknown).toHaveLength(1);
  expect(unknown[0]).not.toBe(user.passwordHash);
  expect(parameters(unknown[0])).toBe(parameters(user.passwordHash));
  expect(parameters(user.passwordHash)).toMatch(/^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+$/);
});
