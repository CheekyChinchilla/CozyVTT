/**
 * Work that runs one piece at a time across the whole server, in the order
 * it arrived. Nothing is refused: each caller waits its turn.
 *
 * For work that holds something large in memory for a while, where several
 * running together could take the backend past its memory limit even though
 * each one alone is fine. Unlike oneAtATime, which refuses a second request
 * from the same user, this queues requests from everyone.
 */
export function serialQueue(): <T>(work: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work);
    tail = run.catch(() => undefined);
    return run;
  };
}
