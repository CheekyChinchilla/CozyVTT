/**
 * Work queued server-wide runs one piece at a time, in order, and a piece
 * that fails does not stop the ones behind it.
 */

import { serialQueue } from '../serialQueue';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
