import { prisma } from '../config/database';
import { prepareRegistration, createRegisteredUser, SetupAlreadyRunError } from './auth';
import { completeSetupInTransaction } from './systemSettings';
import type { SetupSystemConfig } from '../utils/setupConfig';
import type { RegisterInput } from './auth';

export { SetupAlreadyRunError };

/**
 * Run the setup wizard's one write: create the first administrator, apply
 * the wizard's settings and mark setup complete, in one transaction.
 *
 * The three used to be separate writes. A failure after the account was
 * created left an instance nobody could set up or sign in to, and two wizards
 * submitted together both applied their settings and both signed in, though
 * only one account could be the administrator. Under the registration lock a
 * second wizard finds the account count is no longer zero and throws
 * SetupAlreadyRunError, so nothing of it is kept.
 */
export async function setUpInstance(admin: RegisterInput, settings: SetupSystemConfig) {
  const prepared = await prepareRegistration(admin);
  return prisma.$transaction(async (tx) => {
    const user = await createRegisteredUser(tx, prepared, true, { mustBeFirst: true });
    await completeSetupInTransaction(tx, settings);
    return user;
  });
}
