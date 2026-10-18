/**
 * Writers to one map wait their turn before taking a database connection.
 *
 * Every write to a map's tokens, walls, lights or fog runs in a transaction
 * that takes an advisory lock on the map. The lock waits inside the
 * transaction, so every writer queued behind it held a pooled connection
 * while it waited, and a burst of edits to one map could take the whole pool
 * from everyone else. They now queue in this process first, and only the
 * writer whose turn it is opens a transaction.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { withMapsLocked } from '../mapTokens';

afterAll(async () => {
  await prisma.$disconnect();
});

/** Counts the transactions open at once while `run` goes. */
async function mostOpenAtOnce(run: () => Promise<unknown>): Promise<number> {
  let open = 0;
  let most = 0;
  const original = prisma.$transaction.bind(prisma) as (...args: unknown[]) => Promise<unknown>;
  const spy = jest.spyOn(prisma, '$transaction').mockImplementation(((...args: unknown[]) => {
    open += 1;
    most = Math.max(most, open);
    return original(...args).finally(() => { open -= 1; });
  }) as never);
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
  return most;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withMapsLocked', () => {
  it('opens one transaction at a time for writers to the same map', async () => {
    const mapId = randomUUID();
    const order: number[] = [];
    const most = await mostOpenAtOnce(() => Promise.all(
      [0, 1, 2, 3, 4].map((n) => withMapsLocked([mapId], async () => { await pause(20); order.push(n); }))
    ));
    expect(most).toBe(1);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('lets writers to different maps run side by side', async () => {
    const most = await mostOpenAtOnce(() => Promise.all(
      [randomUUID(), randomUUID()].map((mapId) => withMapsLocked([mapId], () => pause(40)))
    ));
    expect(most).toBe(2);
  });

  it('lets the next writer go after one fails', async () => {
    const mapId = randomUUID();
    const failed = withMapsLocked([mapId], async () => { throw new Error('refused'); });
    const next = withMapsLocked([mapId], async () => 'ran');
    await expect(failed).rejects.toThrow('refused');
    await expect(next).resolves.toBe('ran');
  });
});
