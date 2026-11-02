/**
 * Work the server starts without the request or event that caused it
 * waiting for it: the map sent to the table again a moment after a token
 * change, explored ground written a second after a player saw it, a line for
 * the admins' activity log after a sign-in is locked.
 *
 * Each is counted from the moment it is asked for, including the wait before
 * it runs, until it has finished. A shutdown lets it finish before it closes
 * the database (utils/shutdown.ts), and so does the end of every test file.
 * Before, a shutdown closed the database under it, and explored ground still
 * waiting to be written was lost; in the tests, a re-send due after the
 * file's end opened a connection once Jest had torn the file's environment
 * down, which failed the run.
 */

import logger from './logger';

const counted = new Set<{ readonly what: string }>();
let waiting: (() => void)[] = [];

/** Counts `what` until the function returned is called; calling it again does nothing. */
function count(what: string): () => void {
  const entry = { what };
  counted.add(entry);
  return () => {
    if (!counted.delete(entry) || counted.size > 0) return;
    const settled = waiting;
    waiting = [];
    for (const resolve of settled) resolve();
  };
}

/**
 * Starts `work` now, without the caller waiting for it. A failure it does not
 * catch itself is logged.
 */
export function inBackground(what: string, work: () => Promise<void>): void {
  const done = count(what);
  void (async () => {
    try {
      await work();
    } catch (err) {
      logger.error('Background work failed', { what, err });
    } finally {
      done();
    }
  })();
}

/** A wait inBackgroundAfter started. */
export interface WaitingWork {
  /** Drops the work if it has not started; once it has, does nothing. */
  cancel(): void;
}

/**
 * Starts `work` once `ms` have passed, as inBackground. The wait holds no
 * process open.
 */
export function inBackgroundAfter(what: string, ms: number, work: () => Promise<void>): WaitingWork {
  const done = count(what);
  const timer = setTimeout(() => {
    // Counted as running before it stops being counted as waiting.
    inBackground(what, work);
    done();
  }, ms);
  timer.unref?.();
  return {
    cancel() {
      clearTimeout(timer);
      done();
    },
  };
}

/** The work under way or waiting to start. */
export const backgroundWork = {
  get count(): number {
    return counted.size;
  },

  /** What each piece is, for a message about it. */
  get underWay(): string[] {
    return [...counted].map((entry) => entry.what);
  },

  /**
   * Settles once none is under way or waiting: at once when none is. Work
   * that the work under way starts is waited for too.
   */
  finished(): Promise<void> {
    if (counted.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      waiting.push(resolve);
    });
  },
};
