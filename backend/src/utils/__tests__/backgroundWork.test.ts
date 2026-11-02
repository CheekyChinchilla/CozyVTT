/**
 * Work the server starts without the request or event that caused it waiting
 * for it, counted until it has finished, so a shutdown and the end of every
 * test file can let it finish before they close the database.
 */

import { backgroundWork, inBackground, inBackgroundAfter } from '../backgroundWork';
import logger from '../logger';

/** A promise and the function that settles it. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { opened, open };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

afterEach(async () => {
  await backgroundWork.finished();
});

describe('backgroundWork', () => {
  it('has finished at once when nothing is under way', async () => {
    expect(backgroundWork.count).toBe(0);
    await expect(backgroundWork.finished()).resolves.toBeUndefined();
  });

  it('counts work started now until it settles', async () => {
    const { opened, open } = gate();
    let done = false;
    inBackground('a test write', async () => {
      await opened;
      done = true;
    });
    expect(backgroundWork.count).toBe(1);
    expect(backgroundWork.underWay).toEqual(['a test write']);

    const finished = backgroundWork.finished().then(() => done);
    await tick();
    expect(done).toBe(false);
    open();
    await expect(finished).resolves.toBe(true);
    expect(backgroundWork.count).toBe(0);
  });

  it('starts the work at once, before the caller goes on', () => {
    const started: string[] = [];
    inBackground('a test write', async () => {
      started.push('work');
    });
    started.push('caller');
    expect(started).toEqual(['work', 'caller']);
  });

  it('counts work waiting for its time, and has finished only once it has run', async () => {
    let ran = false;
    inBackgroundAfter('a test re-send', 30, async () => {
      ran = true;
    });
    expect(backgroundWork.count).toBe(1);
    expect(ran).toBe(false);

    await backgroundWork.finished();
    expect(ran).toBe(true);
    expect(backgroundWork.count).toBe(0);
  });

  it('waits for work that work under way starts', async () => {
    const order: string[] = [];
    inBackgroundAfter('the first', 10, async () => {
      order.push('first');
      inBackgroundAfter('the second', 20, async () => {
        order.push('second');
      });
    });

    await backgroundWork.finished();
    expect(order).toEqual(['first', 'second']);
  });

  it('counts a cancelled wait no more, and never runs it', async () => {
    let ran = false;
    const waiting = inBackgroundAfter('a test re-send', 20, async () => {
      ran = true;
    });
    waiting.cancel();
    expect(backgroundWork.count).toBe(0);
    await backgroundWork.finished();

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(ran).toBe(false);
  });

  it('cancels nothing else when a wait that has run is cancelled', async () => {
    const first = inBackgroundAfter('the first', 0, async () => {});
    await backgroundWork.finished();

    const { opened, open } = gate();
    inBackground('the second', () => opened);
    first.cancel();
    expect(backgroundWork.count).toBe(1);
    open();
    await backgroundWork.finished();
  });

  it('logs work that fails, and counts it as finished', async () => {
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      const failure = new Error('the database has gone');
      inBackground('a test write', async () => {
        throw failure;
      });
      await backgroundWork.finished();

      expect(backgroundWork.count).toBe(0);
      expect(logged).toHaveBeenCalledWith('Background work failed', { what: 'a test write', err: failure });
    } finally {
      logged.mockRestore();
    }
  });

  it('keeps no process open while work waits for its time', async () => {
    const timers = jest.spyOn(global, 'setTimeout');
    try {
      inBackgroundAfter('a test re-send', 5, async () => {});
      expect(timers).toHaveBeenCalledTimes(1);
      expect(timers.mock.results[0]?.value.hasRef()).toBe(false);
    } finally {
      timers.mockRestore();
    }
    await backgroundWork.finished();
  });
});
