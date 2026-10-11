/**
 * Whether a backup is being restored, for the parts of the backend that must
 * not act on the database while it is replaced.
 *
 * A restore runs one at a time: a second one, or a backup, asked for while
 * one runs is refused (routes/admin.ts). From the moment psql starts
 * replacing the schema until the restore ends, the database is not the one
 * anyone signed in to: live connections have been ended, a new one is
 * refused (websocket/events.ts), and so is every API request
 * (middleware/restoreGate.ts). A request that reached the database then would
 * wait behind the load and write its change over the restored rows.
 *
 * Kept in memory: a backend stopped mid-restore starts with none running.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger';

type RestorePhase = 'none' | 'preparing' | 'replacing';

let phase: RestorePhase = 'none';

/** What a refused request or connection is told while the database is replaced. */
export const RESTORING_MESSAGE = 'The instance is being restored from a backup. Try again in a minute; everyone signs in again once it has finished.';

/** Claim the restore; false when one is running already. */
export function startRestore(): boolean {
  if (phase !== 'none') return false;
  phase = 'preparing';
  return true;
}

/** The restore is about to replace the database. */
export function startReplacingDatabase(): void {
  phase = 'replacing';
}

/** The restore has ended, however it went. */
export function endRestore(): void {
  phase = 'none';
}

export function restoreRunning(): boolean {
  return phase !== 'none';
}

export function databaseBeingReplaced(): boolean {
  return phase === 'replacing';
}

/** The uploaded backup, while it is restored. Older versions named it by the millisecond. */
const RESTORE_UPLOAD_RE = /^restore-temp-[0-9A-Za-z-]+\.zip$/;

/** A name of its own for a restore's upload in the backups folder. */
export function restoreUploadName(): string {
  return `restore-temp-${crypto.randomUUID()}.zip`;
}

/**
 * Remove uploaded backups a backend stopped mid-restore left in the backups
 * folder. Each is the size of a whole backup and nothing will ever finish
 * restoring it. Run when the backend starts (with no listing, read here) and
 * when the backup list is read with no restore running (with its listing). A
 * folder that cannot be read is left for the list to report.
 */
export async function removeLeftoverRestoreUploads(dir: string, listing?: string[]): Promise<void> {
  let files = listing;
  if (files === undefined) {
    try {
      files = await fs.readdir(dir);
    } catch {
      return;
    }
  }
  for (const f of files) {
    if (!RESTORE_UPLOAD_RE.test(f)) continue;
    await fs.unlink(path.join(dir, f))
      .then(() => logger.warn('Removed an uploaded backup a stopped restore left behind', { file: f }))
      .catch(() => {});
  }
}
