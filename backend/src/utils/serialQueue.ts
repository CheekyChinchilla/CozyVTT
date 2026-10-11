/**
 * Work that runs one piece at a time across the whole server, in the order
 * it arrived.
 *
 * For work that holds something large in memory for a while, where several
 * running together could take the backend past its memory limit even though
 * each one alone is fine. Unlike oneAtATime, which refuses a second request
 * from the same user, this queues requests from everyone.
 *
 * Without limits nothing is refused and each piece waits its turn however
 * long that takes. With limits the queue always moves on:
 * - a piece that runs longer than `timeLimitMs` has its signal aborted, its
 *   caller is answered with QueueTimeLimitReached, and the next piece starts
 *   whether or not the overrunning one has stopped;
 * - a piece still waiting after `maxWaitMs` is refused with QueueWaitExpired
 *   and never runs;
 * - a piece whose caller's signal aborts while it waits is dropped with
 *   QueueCallerLeft and never runs. A piece already running is let finish.
 */

export interface QueueLimits {
  /** Longest one piece may run before the queue moves on to the next. */
  timeLimitMs: number;
  /** Longest a piece may wait for its turn before it is refused. */
  maxWaitMs: number;
}

/** The piece waited longer than the queue's `maxWaitMs` and was not run. */
export class QueueWaitExpired extends Error {
  constructor() {
    super('Waited too long for a turn in the queue');
    this.name = 'QueueWaitExpired';
  }
}

/** The piece ran longer than the queue's `timeLimitMs`; the queue has moved on. */
export class QueueTimeLimitReached extends Error {
  constructor() {
    super('Ran past its time limit in the queue');
    this.name = 'QueueTimeLimitReached';
  }
}

/** The caller left while the piece waited, so it was not run. */
export class QueueCallerLeft extends Error {
  constructor() {
    super('The caller left while waiting in the queue');
    this.name = 'QueueCallerLeft';
  }
}

/**
 * Work for the queue. `signal` aborts when the piece runs past its time
 * limit; work that can stop part way checks it before each step that
 * leaves something behind.
 */
export type QueuedWork<T> = (signal: AbortSignal) => Promise<T>;

export function serialQueue(
  limits?: QueueLimits,
): <T>(work: QueuedWork<T>, options?: { signal?: AbortSignal }) => Promise<T> {
  let running = false;
  const waiting: Array<() => void> = [];

  const startNext = () => {
    running = false;
    const next = waiting.shift();
    if (next) next();
  };

  return <T>(work: QueuedWork<T>, options?: { signal?: AbortSignal }): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const caller = options?.signal;
      if (caller?.aborted) {
        reject(new QueueCallerLeft());
        return;
      }
      let waitTimer: NodeJS.Timeout | undefined;

      const leave = (reason: Error) => {
        const at = waiting.indexOf(start);
        if (at < 0) return;
        waiting.splice(at, 1);
        clearTimeout(waitTimer);
        caller?.removeEventListener('abort', onCallerLeft);
        reject(reason);
      };
      const onCallerLeft = () => leave(new QueueCallerLeft());

      function start(): void {
        clearTimeout(waitTimer);
        caller?.removeEventListener('abort', onCallerLeft);
        running = true;
        const controller = new AbortController();
        let done = false;
        let limitTimer: NodeJS.Timeout | undefined;
        const finish = () => {
          if (done) return false;
          done = true;
          clearTimeout(limitTimer);
          startNext();
          return true;
        };
        if (limits) {
          limitTimer = setTimeout(() => {
            if (!finish()) return;
            const reason = new QueueTimeLimitReached();
            controller.abort(reason);
            reject(reason);
          }, limits.timeLimitMs);
        }
        Promise.resolve()
          .then(() => work(controller.signal))
          .then(
            (value) => { if (finish()) resolve(value); },
            (err: unknown) => { if (finish()) reject(err); },
          );
      }

      if (!running && waiting.length === 0) {
        start();
        return;
      }
      waiting.push(start);
      if (limits) waitTimer = setTimeout(() => leave(new QueueWaitExpired()), limits.maxWaitMs);
      caller?.addEventListener('abort', onCallerLeft, { once: true });
    });
}
