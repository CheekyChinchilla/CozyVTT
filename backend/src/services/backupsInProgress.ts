/**
 * Backups being written now, by name.
 *
 * Each is written to its name plus `.partial`, which the backup list never
 * shows, and renamed once it is complete, so a backup the backend is stopped
 * partway through never appears as a backup (routes/admin.ts). The list
 * removes a partial file no backup here is writing, and a shutdown waits for
 * the backups written here to finish (utils/shutdown.ts).
 */

const writing = new Set<string>();
let waiting: (() => void)[] = [];

export const backupsInProgress = {
  add(name: string): void {
    writing.add(name);
  },

  delete(name: string): void {
    writing.delete(name);
    if (writing.size > 0) return;
    const settled = waiting;
    waiting = [];
    for (const resolve of settled) resolve();
  },

  has(name: string): boolean {
    return writing.has(name);
  },

  get count(): number {
    return writing.size;
  },

  /** Settles once no backup is being written: at once when none is. */
  finished(): Promise<void> {
    if (writing.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      waiting.push(resolve);
    });
  },
};
