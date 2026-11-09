/**
 * What every test file does once its last hook has run: jest.environment.ts
 * calls endHeldTestFile then, through the global jest.afterEnv.ts sets.
 *
 * Jest gives each test file its own module registry, so each file that
 * touches the database builds its own Prisma clients: the app's (through
 * config/database.ts) and the test helpers'. Workers are reused across
 * files, and a client that is never disconnected keeps its connections
 * until the worker exits, so a full run accumulated one pool per file per
 * worker and reached PostgreSQL's connection ceiling late in the run, with
 * unrelated suites failing on "too many clients already". Every file now
 * lets both clients go when it finishes.
 *
 * Work the server started without anyone waiting for it
 * (utils/backgroundWork.ts) is let finish first. A token change sends the
 * map to the table again 100 ms later; a file whose last request changed a
 * token used to end first, and the re-send then opened a connection inside
 * an environment Jest had torn down, which failed the run.
 *
 * This used to be an afterAll declared before anything in the test file,
 * which ran before the file's own top-level afterAll hooks: one that cleaned
 * up the database opened a client again, and had to end with its own
 * `$disconnect()`. Now it runs after all of them.
 */

declare global {
  /** Set on each file's global object by jest.afterEnv.ts; called by jest.environment.ts. */
  var __endTestFile: (() => Promise<void>) | undefined;
}

/**
 * How long the end of a file waits for that work, and then for the clients
 * to let go, before it fails the file. Jest gives it no time limit of its
 * own after the last hook.
 */
export const WORK_WAIT_MS = 5000;

// The timer's own, taken before the test file can put fake timers in its
// place: work waiting on a fake timer never starts, and the wait would never
// end.
const realSetTimeout = setTimeout;
const realClearTimeout = clearTimeout;

/** Whether `settling` settles within `ms`, timed on the real timer. */
async function within(ms: number, settling: Promise<unknown>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = await Promise.race([
    settling.then(() => true),
    new Promise<false>((resolve) => { timer = realSetTimeout(() => resolve(false), ms); }),
  ]);
  realClearTimeout(timer);
  return settled;
}

interface Held {
  backgroundWork: typeof import('../../utils/backgroundWork').backgroundWork;
  helpers: typeof import('./db').prisma;
}
let held: Held | undefined;

/**
 * Loads what endTestFile uses. Jest refuses to load a module once the file's
 * last hook has run, so jest.afterEnv.ts calls this from an afterAll, inside
 * the file. The helpers' client is loaded whether or not this file imported
 * it: an unused client has no connections and disconnecting it costs nothing.
 */
export function holdTestFileEnd(): Held {
  held ??= {
    backgroundWork: (require('../../utils/backgroundWork') as typeof import('../../utils/backgroundWork')).backgroundWork,
    helpers: (require('./db') as typeof import('./db')).prisma,
  };
  return held;
}

/** endTestFile, for the environment: nothing when no hook of the file ran, as then no test did. */
export async function endHeldTestFile(): Promise<void> {
  if (held) await endTestFile();
}

/**
 * Lets the work the server started finish, then lets both Prisma clients go.
 * Fails if that work is still under way after `waitMs`, or if the clients
 * have not let go `waitMs` after that: letting a client go waits for each of
 * its queries to end.
 */
export async function endTestFile(waitMs: number = WORK_WAIT_MS): Promise<void> {
  const { backgroundWork, helpers } = holdTestFileEnd();
  const seconds = waitMs / 1000;
  const problems: string[] = [];
  if (!(await within(waitMs, backgroundWork.finished()))) {
    problems.push(
      `Work the server started was still under way ${seconds} seconds after the file's last hook: ${backgroundWork.underWay.join('; ')}. ` +
        'Work asked for while fake timers were on starts only if they are advanced past it.'
    );
  }

  const cached = (global as unknown as { prisma?: { $disconnect(): Promise<void> } }).prisma;
  // Both at once: a query on one client can be waiting on a lock a query on
  // the other holds until its client lets go.
  if (!(await within(waitMs, Promise.all([cached?.$disconnect(), helpers.$disconnect()])))) {
    problems.push(
      `The database clients still had a query running ${seconds} seconds after the file's last hook, so they were not let go. ` +
        'A test left a query that does not end, such as one waiting on a lock.'
    );
  }

  if (problems.length > 0) throw new Error(problems.join(' '));
}
