import fs from 'fs/promises';
import path from 'path';
import logger from './logger';

/**
 * Where the admin dashboard writes instance backups.
 *
 * Those ZIPs hold a full pg_dump: password hashes, MFA secrets, backup codes
 * and the session table. They used to live under `uploads/backups`, while the
 * docs told self-hosters to sync `uploads/` off-site as the media half of a
 * backup strategy, which shipped every credential with it. The default is now
 * a sibling `backups/` directory, matching `scripts/backup.sh`; `BACKUP_DIR`
 * overrides it, and a value inside the uploads directory is refused.
 */
export function resolveBackupDir(
  env: Record<string, string | undefined> = process.env
): string {
  const uploads = path.resolve(env.UPLOAD_DIR || 'uploads');
  const backups = path.resolve(env.BACKUP_DIR || 'backups');
  if (isInside(backups, uploads)) {
    throw new Error(
      `BACKUP_DIR (${backups}) must not be inside the uploads directory (${uploads}): backups hold every credential on the instance`
    );
  }
  return backups;
}

/** Whether `child` is `parent` or lies beneath it. */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Create the backups folder if needed, readable by the backend's user alone.
 *
 * Each archive is written 600, but the folder's listing (every backup's name,
 * date and size) followed the process umask, usually 755, on an install
 * without Docker; only the container's start script set 700. `mkdir`'s mode
 * applies only to a folder it creates, so an existing one is chmodded too. A
 * mount that does not take a mode is logged and otherwise left alone, since
 * refusing the backup would be worse than a folder listing others can read.
 */
export async function ensureBackupDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await fs.chmod(dir, 0o700);
  } catch (error) {
    logger.warn('Could not make the backups folder private to the backend user', { dir, err: error });
  }
}

