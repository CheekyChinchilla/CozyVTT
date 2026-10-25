/**
 * The queue Universal VTT imports wait in.
 *
 * Reading an import holds the file and its decoded picture in memory, well
 * over 50 MB for the largest; several at once took the backend near its
 * memory limit. So imports are read one at a time across the server, each
 * waiting its turn with its upload on disk.
 *
 * The queue always moves on. An import that runs past its time limit is
 * stopped at its next step, removes what it saved, and the next one starts.
 * An import that cannot start soon enough is refused, so the DM is told to
 * try again before the bundled nginx gives up on the request (its
 * proxy_read_timeout for the API is 60 seconds), and an import whose DM has
 * left is dropped without being read.
 */

import { serialQueue } from '../utils/serialQueue';

/**
 * Longest one import may run. The slowest import measured took 5 seconds on
 * a desktop computer, upload included: a 16,000-pixel square WebP picture of
 * 88 MB (above the default 50 MB map limit) with 5,000 walls and 200 lights.
 * The same import with a 47 MB PNG or a 70 MB JPEG of that size took about
 * 1.3 seconds. Six times the slowest leaves room for a slower server.
 */
export const UVTT_IMPORT_TIME_LIMIT_MS = 30_000;

/**
 * Longest an import may wait for its turn. Waiting and running together stay
 * under nginx's 60 seconds, so the DM sees the reason and not a proxy error;
 * keepInStep.test.ts holds the two at least five seconds under it.
 */
export const UVTT_IMPORT_MAX_WAIT_MS = 20_000;

export const uvttImportQueue = serialQueue({
  timeLimitMs: UVTT_IMPORT_TIME_LIMIT_MS,
  maxWaitMs: UVTT_IMPORT_MAX_WAIT_MS,
});
