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

/**
 * Argon2's check made slow: it answers 50 ms late, and `finished` says
 * whether every check begun has answered.
 */
function slowChecks(on: typeof argon2): { finished: () => boolean } {
  const real = on.verify.bind(on);
  let begun = 0;
  let answered = 0;
  jest.spyOn(on, 'verify').mockImplementation(async (...args: Parameters<typeof argon2.verify>) => {
    begun += 1;
    const result = await real(...args);
    await new Promise((resolve) => setTimeout(resolve, 50));
    answered += 1;
    return result;
  });
  return { finished: () => begun > 0 && answered === begun };
}

it('answers only once the check has finished, whether or not the email has an account', async () => {
  const user = await createTestUser({ displayName: 'Timing wait' });
  created.push(user.id);

  for (const email of [user.email, testEmail('nobody')]) {
    const checks = slowChecks(argon2);
    expect(await authenticateUser({ email, password: 'wrong-password' })).toBeNull();
    // Answered before the check finished, an unknown email would be quick again.
    expect(checks.finished()).toBe(true);
    jest.restoreAllMocks();
  }
});

it('checks an unknown email against the hash made at start, of the same cost as a real one', async () => {
  const user = await createTestUser({ displayName: 'Timing start' });
  created.push(user.id);

  // A fresh copy of the service, whose dummy hash is not made yet, with the
  // copy of Argon2 it uses, to watch.
  let auth: typeof import('../auth') | undefined;
  let ownArgon2: typeof argon2 | undefined;
  jest.isolateModules(() => {
    ownArgon2 = require('argon2') as typeof argon2;
    auth = require('../auth') as typeof import('../auth');
  });
  if (!auth || !ownArgon2) throw new Error('auth service did not load');

  const made = jest.spyOn(ownArgon2, 'hash');
  await auth.makeDummyPasswordHash();
  expect(made).toHaveBeenCalledTimes(1);

  const verify = jest.spyOn(ownArgon2, 'verify');
  expect(await auth.authenticateUser({ email: testEmail('nobody'), password: 'wrong-password' })).toBeNull();
  // Nothing made on the way: the check is against the start's hash.
  expect(made).toHaveBeenCalledTimes(1);
  expect(verify).toHaveBeenCalledTimes(1);
  const dummy = verify.mock.calls[0][0];
  expect(dummy).toBe(await made.mock.results[0].value);
  expect(parameters(dummy)).toBe(parameters(user.passwordHash));
});
