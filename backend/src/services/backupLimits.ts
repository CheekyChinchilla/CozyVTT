// ============================================
// What the Admin Panel's restore takes
// ============================================
//
// A restore takes a backup of at most 4 GB that unpacks to at most 10 GiB in
// at most 100,000 files: the upload is capped by multer, and media
// compresses poorly, so the unpacked ceiling fits real backups while
// stopping a zip bomb long before it can fill the disk (utils/archive.ts).
// Create Backup reads a backup it has made against the same limits, so a
// backup the restore would refuse is said to be one when it is made.

import { countListedEntries, openArchiveFile } from '../utils/archive';

export interface RestoreLimits {
  /** The largest backup file the restore's upload takes. */
  maxUploadBytes: number;
  /** The most files a backup may hold. */
  maxFiles: number;
  /** The most a backup may unpack to. */
  maxTotalBytes: number;
}

export const RESTORE_LIMITS: RestoreLimits = {
  maxUploadBytes: 4 * 1024 ** 3,
  maxFiles: 100_000,
  maxTotalBytes: 10 * 1024 ** 3,
};

const sizeOf = (bytes: number, unit: 'GB' | 'GiB') =>
  `${(bytes / 1024 ** 3).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`;

/**
 * Why the restore would refuse the backup at `zipPath`, `sizeBytes` long, as
 * a message for the admin who made it, or null when it would take it. Its
 * files are counted and their unpacked sizes summed from the archive's
 * directory, as the restore reads them.
 */
export async function restoreRefusalOf(zipPath: string, sizeBytes: number, limits: RestoreLimits = RESTORE_LIMITS): Promise<string | null> {
  const refused = (why: string) =>
    `The Admin Panel's restore would refuse this backup: ${why} It is kept: restore it from the command line, as the deployment guide's "To restore anyway" describes.`;
  if (sizeBytes > limits.maxUploadBytes) {
    return refused(`it is larger than the ${sizeOf(limits.maxUploadBytes, 'GB')} the restore takes.`);
  }
  const listed = await countListedEntries(zipPath);
  if (listed > limits.maxFiles) {
    return refused(`it holds ${listed.toLocaleString('en-US')} files, more than the ${limits.maxFiles.toLocaleString('en-US')} the restore takes.`);
  }
  const directory = await openArchiveFile(zipPath, limits.maxFiles);
  const unpacked = directory.files.filter((f) => f.type === 'File').reduce((sum, f) => sum + f.uncompressedSize, 0);
  if (unpacked > limits.maxTotalBytes) {
    return refused(`it unpacks to more than the ${sizeOf(limits.maxTotalBytes, 'GiB')} the restore takes.`);
  }
  return null;
}
