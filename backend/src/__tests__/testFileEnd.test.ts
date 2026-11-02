/**
 * The end of every test file (helpers/testFileEnd.ts) gives up, with a
 * message saying why, when the database clients will not let go.
 *
 * The end runs after the file's last hook, where Jest gives it no time limit
 * of its own. Letting a client go waits for every query it has running, so a
 * query that never ended stalled the file with no message, or for good.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { endTestFile } from './helpers/testFileEnd';
import { prisma } from './helpers/db';
import { inBackground } from '../utils/backgroundWork';

it('fails, naming the cause, when a query is still running past the bound', async () => {
  // A Prisma query starts when it is first awaited or given a then().
  const running = prisma.$executeRaw`SELECT pg_sleep(2)`.then(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 200));

  const started = Date.now();
  await expect(endTestFile(300)).rejects.toThrow(
    "The database clients still had a query running 0.3 seconds after the file's last hook"
  );
  expect(Date.now() - started).toBeLessThan(1500);
  await running;
});

// Fake timers switched off again in an afterEach still drop the work's
// timer: it was set while they were on, and never fires.
it('names the work left, and says how fake timers keep work from starting', async () => {
  let release = () => {};
  inBackground('a test write that never ends', () => new Promise<void>((resolve) => { release = resolve; }));
  try {
    await expect(endTestFile(100)).rejects.toThrow(
      "Work the server started was still under way 0.1 seconds after the file's last hook: a test write that never ends. " +
        'Work asked for while fake timers were on starts only if they are advanced past it.'
    );
  } finally {
    release();
  }
});
