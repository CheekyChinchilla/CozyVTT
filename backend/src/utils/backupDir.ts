import path from 'path';

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
