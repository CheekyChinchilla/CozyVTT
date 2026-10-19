/**
 * An import writes long lists in batches.
 *
 * The creatures and token templates of an archive were each written in one
 * statement, so a list as long as its 10 MB file allows (some 65,000 minimal
 * creatures) took the heap to about a gigabyte and stopped the server. They
 * are written 500 rows at a time.
 */

jest.mock('../../config/database', () => ({ prisma: {} }));

import { inBatches } from '../campaignImporter';

it('writes 500 rows at a time, then the rest, and counts what it wrote', async () => {
  const written: number[] = [];
  const items = Array.from({ length: 1201 }, (_, i) => i);
  const count = await inBatches(items, (n) => ((n as number) % 100 === 99 ? null : { n }), async (rows) => { written.push(rows.length); });
  // Every hundredth item is left out by its preparation.
  expect(count).toBe(1201 - 12);
  expect(written).toEqual([500, 500, 189]);
});

it('writes nothing for an empty list', async () => {
  const write = jest.fn();
  expect(await inBatches([], () => ({}), write)).toBe(0);
  expect(write).not.toHaveBeenCalled();
});
