/**
 * How full the disk holding the uploads is, for the Admin Panel's warning.
 *
 * No per-user storage quota is enforced, so an account can fill the disk the
 * uploads, backups and often the database share. The dashboard instead warns
 * an administrator once that disk is more than 80% full.
 */

import os from 'os';
import path from 'path';
import type { StatsFs } from 'fs';
import { uploadsDiskUsage, DISK_WARNING_PERCENT } from '../uploadsDisk';

/** A disk of 1,000 blocks of 4 KB, `free` of them free and `available` of those usable by the backend. */
function disk(free: number, available = free): () => Promise<StatsFs> {
  return async () => ({ bsize: 4096, blocks: 1000, bfree: free, bavail: available, files: 0, ffree: 0, type: 0 }) as StatsFs;
}

describe('uploadsDiskUsage', () => {
  it('warns over 80% full', async () => {
    expect(DISK_WARNING_PERCENT).toBe(80);
    const usage = await uploadsDiskUsage(os.tmpdir(), disk(150));
    expect(usage).toEqual({ totalBytes: 4096 * 1000, freeBytes: 4096 * 150, usedPercent: 85, warning: true });
  });

  it('does not warn at 80% or under', async () => {
    expect((await uploadsDiskUsage(os.tmpdir(), disk(200)))?.warning).toBe(false);
    expect((await uploadsDiskUsage(os.tmpdir(), disk(600)))?.warning).toBe(false);
  });

  it('counts the space kept back for the system as used, as df does', async () => {
    // 200 blocks free, 100 of them reserved: 800 used of 900 the backend can use.
    const usage = await uploadsDiskUsage(os.tmpdir(), disk(200, 100));
    expect(usage?.usedPercent).toBe(89);
    expect(usage?.freeBytes).toBe(4096 * 100);
    expect(usage?.warning).toBe(true);
  });

  it('reads the nearest folder that exists, for an uploads folder not made yet', async () => {
    const asked: string[] = [];
    const statfs = async (where: string) => {
      asked.push(where);
      if (where.endsWith('not-made-yet')) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return disk(500)();
    };
    const usage = await uploadsDiskUsage(path.join(os.tmpdir(), 'not-made-yet'), statfs);
    expect(usage?.usedPercent).toBe(50);
    expect(asked[asked.length - 1]).toBe(os.tmpdir());
  });

  it('answers null when the disk cannot be read', async () => {
    const usage = await uploadsDiskUsage(os.tmpdir(), async () => { throw new Error('not supported'); });
    expect(usage).toBeNull();
  });

  it('reads a real disk', async () => {
    const usage = await uploadsDiskUsage(os.tmpdir());
    expect(usage?.totalBytes).toBeGreaterThan(0);
    expect(usage?.usedPercent).toBeGreaterThanOrEqual(0);
    expect(usage?.usedPercent).toBeLessThanOrEqual(100);
  });
});
