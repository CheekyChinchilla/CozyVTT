/**
 * How full the disk holding the uploads folder is.
 *
 * No per-user storage quota is enforced: any approved account can upload up
 * to its rate limit, and the disk the uploads share with the backups (and,
 * on most installs, the database) is what runs out. The Admin Panel shows
 * this and warns once the disk is more than DISK_WARNING_PERCENT full, so an
 * administrator can act before uploads, backups or the database start to
 * fail. A quota per user may come later as a setting.
 */

import fsp from 'fs/promises';
import path from 'path';
import type { StatsFs } from 'fs';
import { getUploadsDirectory } from '../utils/fileUtils';

export const DISK_WARNING_PERCENT = 80;

export interface UploadsDisk {
  totalBytes: number;
  /** What the backend can still write: the space kept back for the system is not counted. */
  freeBytes: number;
  /** Used, as `df` counts it: of the space the backend could use, how much is taken. Whole percent. */
  usedPercent: number;
  /** More than DISK_WARNING_PERCENT full. */
  warning: boolean;
}

/**
 * Read the disk `dir` is on. A folder not made yet is read from the nearest
 * one above it that exists. Answers null when the disk cannot be read, so
 * the dashboard leaves the line out instead of failing.
 */
export async function uploadsDiskUsage(
  dir: string = getUploadsDirectory(),
  statfs: (where: string) => Promise<StatsFs> = (where) => fsp.statfs(where),
): Promise<UploadsDisk | null> {
  let where = path.resolve(dir);
  for (;;) {
    try {
      const stats = await statfs(where);
      const used = (stats.blocks - stats.bfree) * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const usable = used + free;
      const usedPercent = usable > 0 ? Math.round((used / usable) * 100) : 0;
      return {
        totalBytes: stats.blocks * stats.bsize,
        freeBytes: free,
        usedPercent,
        warning: usedPercent > DISK_WARNING_PERCENT,
      };
    } catch (error) {
      const parent = path.dirname(where);
      if ((error as { code?: unknown }).code !== 'ENOENT' || parent === where) return null;
      where = parent;
    }
  }
}
