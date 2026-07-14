/**
 * Safe ZIP archive helpers.
 *
 * Shared by the campaign importer (services/campaignImporter.ts) and the admin
 * backup restore (routes/admin.ts) so both apply the same protections:
 *   - Path traversal (zip-slip): entry paths that escape the destination via
 *     "..", absolute paths, or backslashes are rejected.
 *   - Zip bombs: total decompressed bytes are tracked and capped.
 *   - Resource exhaustion: the entry count is capped.
 *
 * Entries are streamed to disk (never fully buffered), so restoring a multi-GB
 * instance backup does not exhaust the container memory limit.
 */
import path from 'path';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { CentralDirectory } from 'unzipper';

/**
 * Reject archive entry paths that attempt traversal or absolute escape.
 * Accepts only simple relative paths that stay beneath the extraction root.
 */
export function isSafeArchivePath(name: string): boolean {
  if (!name) return false;
  if (name.includes('..')) return false;
  if (name.includes('\\')) return false;
  // Must be a simple relative path under the expected directory.
  const normalized = path.posix.normalize(name);
  if (normalized.startsWith('/') || normalized.startsWith('..')) return false;
  return true;
}

export interface SafeExtractOptions {
  /** Maximum number of file entries permitted in the archive. */
  maxFiles: number;
  /** Maximum total decompressed size, in bytes (zip-bomb ceiling). */
  maxTotalBytes: number;
}

/**
 * Extract every file entry in `directory` beneath `destRoot`, streaming each to
 * disk. Throws if any entry escapes `destRoot`, the entry count exceeds
 * `maxFiles`, or the running decompressed total exceeds `maxTotalBytes`.
 *
 * Directory entries are created implicitly from each file's parent path.
 * Symlink entries are not honored — unzipper writes file contents only, so an
 * archive cannot plant a symlink and follow it out of `destRoot`.
 */
export async function extractArchiveSafely(
  directory: CentralDirectory,
  destRoot: string,
  options: SafeExtractOptions
): Promise<void> {
  const fileEntries = directory.files.filter((f) => f.type === 'File');
  if (fileEntries.length > options.maxFiles) {
    throw new Error(`Archive contains too many files (${fileEntries.length}, max ${options.maxFiles})`);
  }

  const resolvedRoot = path.resolve(destRoot);
  let totalBytes = 0;

  for (const entry of fileEntries) {
    if (!isSafeArchivePath(entry.path)) {
      throw new Error(`Unsafe file path in archive: ${entry.path}`);
    }

    const destPath = path.resolve(destRoot, entry.path);
    // Defense in depth: the resolved path must stay within destRoot even if the
    // string checks above are ever bypassed by a platform-specific quirk.
    if (destPath !== resolvedRoot && !destPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Unsafe file path in archive: ${entry.path}`);
    }

    await fs.mkdir(path.dirname(destPath), { recursive: true });

    // Count decompressed bytes as they flow so a zip bomb is stopped mid-stream
    // rather than after the whole (potentially enormous) entry lands on disk.
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        totalBytes += chunk.length;
        if (totalBytes > options.maxTotalBytes) {
          cb(new Error('Archive exceeds maximum decompressed size (possible zip bomb)'));
          return;
        }
        cb(null, chunk);
      },
    });

    await pipeline(entry.stream(), counter, createWriteStream(destPath));
  }
}
