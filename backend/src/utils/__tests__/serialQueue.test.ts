/**
 * Work queued server-wide runs one piece at a time, in order, and a piece
 * that fails does not stop the ones behind it.
 *
 * With limits, the queue always moves on: a piece that runs past its time
 * limit is told to stop and the next one starts, a piece that has waited too
 * long is refused without running, and a piece whose caller has left is
 * dropped without running.
 */

import { serialQueue, QueueWaitExpired, QueueTimeLimitReached, QueueCallerLeft } from '../serialQueue';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** A promise that settles only when `release` is called. */
function held(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe('serialQueue', () => {
  it('runs one piece at a time, in the order they arrived', async () => {
    const queue = serialQueue();
    const log: string[] = [];
    let running = 0;
    let most = 0;
    const piece = (name: string, ms: number) => queue(async () => {
      running += 1;
      most = Math.max(most, running);
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
      running -= 1;
      return name;
    });

    expect(await Promise.all([piece('a', 30), piece('b', 5), piece('c', 10)])).toEqual(['a', 'b', 'c']);
    expect(most).toBe(1);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('goes on after a piece that fails, which its caller sees fail', async () => {
    const queue = serialQueue();
    const failed = queue(async () => { throw new Error('boom'); });
    const next = queue(async () => 'still runs');

    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe('still runs');
  });
});

describe('serialQueue with limits', () => {
  it('moves on once a piece runs past its time limit, and tells that piece to stop', async () => {
    const queue = serialQueue({ timeLimitMs: 50, maxWaitMs: 1000 });
    const hung = held();
    let hungSignal: AbortSignal | undefined;
    const first = queue(async (signal) => {
      hungSignal = signal;
      await hung.promise;
      return 'first';
    });
    const second = queue(async () => 'second');

    await expect(first).rejects.toBeInstanceOf(QueueTimeLimitReached);
    expect(hungSignal?.aborted).toBe(true);
    expect(await second).toBe('second');
    hung.release();
  });

  it('refuses a piece that waited longer than its wait limit, without running it', async () => {
    const queue = serialQueue({ timeLimitMs: 1000, maxWaitMs: 40 });
    const busy = held();
    const ran: string[] = [];
    const first = queue(async () => { ran.push('first'); await busy.promise; });
    const waiting = queue(async () => { ran.push('waiting'); });

    await expect(waiting).rejects.toBeInstanceOf(QueueWaitExpired);
    busy.release();
    await first;
    expect(await queue(async () => 'after')).toBe('after');
    expect(ran).toEqual(['first']);
  });

  it('drops a waiting piece whose caller left, without running it', async () => {
    const queue = serialQueue({ timeLimitMs: 1000, maxWaitMs: 1000 });
    const busy = held();
    const ran: string[] = [];
    const first = queue(async () => { ran.push('first'); await busy.promise; });
    const caller = new AbortController();
    const left = queue(async () => { ran.push('left'); }, { signal: caller.signal });
    const behind = queue(async () => { ran.push('behind'); });

    caller.abort();
    await expect(left).rejects.toBeInstanceOf(QueueCallerLeft);
    busy.release();
    await first;
    await behind;
    expect(ran).toEqual(['first', 'behind']);
  });

  it('refuses at once a caller that had already left', async () => {
    const queue = serialQueue({ timeLimitMs: 1000, maxWaitMs: 1000 });
    const caller = new AbortController();
    caller.abort();
    let ran = false;

    await expect(queue(async () => { ran = true; }, { signal: caller.signal })).rejects.toBeInstanceOf(QueueCallerLeft);
    expect(ran).toBe(false);
  });

  it('lets a running piece finish when its caller leaves', async () => {
    const queue = serialQueue({ timeLimitMs: 1000, maxWaitMs: 1000 });
    const caller = new AbortController();
    const running = queue(async () => { await sleep(20); return 'done'; }, { signal: caller.signal });
    await sleep(5);
    caller.abort();

    expect(await running).toBe('done');
  });
});
