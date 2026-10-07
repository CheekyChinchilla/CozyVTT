/**
 * Safe ZIP archive helpers.
 *
 * Used by the campaign importer (services/campaignImporter.ts) and the admin
 * backup restore (routes/admin.ts), which apply the same protections:
 *   - Path traversal (zip-slip): entry paths that escape the destination via
 *     "..", absolute paths, or backslashes are rejected.
 *   - Zip bombs: total decompressed bytes are tracked and capped.
 *   - Resource exhaustion: the entry count is capped.
 *
 * Entries are streamed to disk (never fully buffered), so restoring a multi-GB
 * instance backup does not exhaust the container memory limit.
 */
import path from 'path';
import zlib from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import fs from 'fs/promises';
import { Readable, Transform, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import unzipper from 'unzipper';
import type { CentralDirectory, File as ArchiveEntry } from 'unzipper';

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

  // A backup unpacks its whole database here, so a folder this creates is its
  // user's alone. The files keep the default mode: a restore copies the
  // uploads among them into the uploads folder, and each copy keeps its mode.
  await fs.mkdir(resolvedRoot, { recursive: true, mode: 0o700 });

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

    // TODO(restore): stopping unzipper's entry stream part-way leaves the
    // backup file open, so each refused restore keeps a file handle and the
    // deleted upload's disk space until the process ends. The caller also
    // reads the whole directory before the maxFiles check above can run, which
    // costs over a kilobyte an entry. unpackEntry and openArchiveFile below do
    // both safely, and the restore should use them.
    await pipeline(entry.stream(), counter, createWriteStream(destPath));
  }
}

// ── Reading an untrusted archive in bounded memory ──────────────────────────
//
// An archive says how many entries it has and how large each one unpacks to,
// and either can be a lie. Reading the directory costs memory for every entry
// it lists (over a kilobyte each, so a 50 MB archive listing a million entries
// needs more memory than the backend has), and an entry can unpack to a
// thousand times its packed size. So the entry count is read from the
// archive's last bytes before the directory is, and every entry is unpacked
// through a counter that stops it the moment it passes its limit.

const END_OF_DIRECTORY = 0x06054b50;
const ZIP64_END_LOCATOR = 0x07064b50;
const ZIP64_END_OF_DIRECTORY = 0x06064b50;
const LOCAL_FILE_HEADER = 0x04034b50;
/** How far from the end unzipper looks for the end-of-directory record. */
const UNZIPPER_TAIL_BYTES = 80;

/** Why reading an archive stopped. */
export class ArchiveLimitError extends Error {
  constructor(
    message: string,
    /** `entry`: one entry passed its own limit; `total`: the archive passed its limit. */
    readonly limit: 'entry' | 'total'
  ) {
    super(message);
    this.name = 'ArchiveLimitError';
  }
}

/** Bytes read from a file at a position; fewer than asked for at its end. */
async function readAt(handle: fs.FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

const NOT_A_ZIP = 'The file is not a ZIP archive, or it is damaged.';

/**
 * How many entries an archive's directory lists, read from its end the way
 * unzipper finds it: the first end-of-directory record in the last 80 bytes,
 * and the ZIP64 record it points to when the short record's fields are full.
 */
export async function countListedEntries(filePath: string): Promise<number> {
  const handle = await fs.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    const tailStart = Math.max(0, size - UNZIPPER_TAIL_BYTES);
    const tail = await readAt(handle, tailStart, size - tailStart);
    let at = -1;
    for (let i = 0; i + 4 <= tail.length; i++) {
      if (tail.readUInt32LE(i) === END_OF_DIRECTORY) {
        at = i;
        break;
      }
    }
    if (at === -1 || at + 22 > tail.length) throw new Error(NOT_A_ZIP);

    const diskNumber = tail.readUInt16LE(at + 4);
    const listed = tail.readUInt16LE(at + 10);
    const directoryOffset = tail.readUInt32LE(at + 16);
    if (diskNumber !== 0xffff && listed !== 0xffff && directoryOffset !== 0xffffffff) return listed;

    // ZIP64: the locator sits just before the short record and says where the
    // long one is, which carries the count in eight bytes.
    const locator = await readAt(handle, tailStart + at - 20, 20);
    if (locator.length < 20 || locator.readUInt32LE(0) !== ZIP64_END_LOCATOR) throw new Error(NOT_A_ZIP);
    const record = await readAt(handle, Number(locator.readBigUInt64LE(8)), 56);
    if (record.length < 56 || record.readUInt32LE(0) !== ZIP64_END_OF_DIRECTORY) throw new Error(NOT_A_ZIP);
    const count = record.readBigUInt64LE(32);
    return count > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(count);
  } finally {
    await handle.close();
  }
}

/**
 * Open an archive on disk, refusing one whose directory lists more than
 * `maxEntries` entries before reading the directory.
 */
export async function openArchiveFile(filePath: string, maxEntries: number): Promise<CentralDirectory> {
  const listed = await countListedEntries(filePath);
  if (listed > maxEntries) {
    throw new Error(
      `The archive lists ${listed.toLocaleString('en-US')} files, more than the ${maxEntries.toLocaleString('en-US')} it may hold.`
    );
  }
  return unzipper.Open.file(filePath);
}

/** A running total of what one archive has unpacked, against its limit. */
export class UnpackedTotal {
  private used = 0;

  constructor(readonly maxBytes: number) {}

  /** Count `bytes` more; false once the total is past the limit. */
  add(bytes: number): boolean {
    this.used += bytes;
    return this.used <= this.maxBytes;
  }

  get bytes(): number {
    return this.used;
  }
}

export interface EntryLimits {
  /** The most this one entry may unpack to. */
  maxEntryBytes: number;
  /** Shared by every entry read from the archive. */
  total: UnpackedTotal;
}

/**
 * Unpack one entry into `destination`, stopping with an ArchiveLimitError as
 * soon as it passes either limit.
 *
 * The entry's packed bytes are read with a stream of our own, and every
 * stream is in one pipeline, so a stopped entry closes the archive file.
 * unzipper's own entry stream does not: stopping it part-way leaves the file
 * open, and a few hundred refused entries would use up the process's files.
 */
async function unpackEntry(archivePath: string, entry: ArchiveEntry, limits: EntryLimits, destination: Writable): Promise<void> {
  // The size the directory claims is a quick refusal, never the only check.
  if (entry.uncompressedSize > limits.maxEntryBytes) {
    destination.destroy();
    throw new ArchiveLimitError(`${entry.path} unpacks to more than the ${limits.maxEntryBytes} bytes it may hold`, 'entry');
  }
  if (entry.flags & 0x1) {
    destination.destroy();
    throw new Error(`${entry.path} is encrypted, which a campaign archive never is.`);
  }
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    destination.destroy();
    throw new Error(`${entry.path} is packed in a way this server cannot read.`);
  }

  const handle = await fs.open(archivePath, 'r');
  let start: number;
  try {
    const header = await readAt(handle, entry.offsetToLocalFileHeader, 30);
    if (header.length < 30 || header.readUInt32LE(0) !== LOCAL_FILE_HEADER) {
      destination.destroy();
      throw new Error(`The archive is damaged: ${entry.path} cannot be read.`);
    }
    start = entry.offsetToLocalFileHeader + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally {
    await handle.close();
  }

  const packed: Readable =
    entry.compressedSize === 0
      ? Readable.from([])
      : createReadStream(archivePath, { start, end: start + entry.compressedSize - 1 });

  let entryBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      entryBytes += chunk.length;
      if (entryBytes > limits.maxEntryBytes) {
        cb(new ArchiveLimitError(`${entry.path} unpacks to more than the ${limits.maxEntryBytes} bytes it may hold`, 'entry'));
        return;
      }
      if (!limits.total.add(chunk.length)) {
        cb(new ArchiveLimitError(`The archive unpacks to more than ${limits.total.maxBytes} bytes`, 'total'));
        return;
      }
      cb(null, chunk);
    },
  });

  if (entry.compressionMethod === 8) {
    await pipeline(packed, zlib.createInflateRaw(), counter, destination);
  } else {
    await pipeline(packed, counter, destination);
  }
}

/** Unpack one entry into memory, within `limits`. */
export async function readArchiveEntry(archivePath: string, entry: ArchiveEntry, limits: EntryLimits): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const collect = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
  });
  await unpackEntry(archivePath, entry, limits, collect);
  return Buffer.concat(chunks);
}

/**
 * Unpack one entry to a new file at `destPath`, within `limits`. On any
 * failure the part-written file is removed. Returns the bytes written.
 */
export async function writeArchiveEntry(
  archivePath: string,
  entry: ArchiveEntry,
  destPath: string,
  limits: EntryLimits
): Promise<number> {
  const out = createWriteStream(destPath, { flags: 'wx' });
  try {
    await unpackEntry(archivePath, entry, limits, out);
    return out.bytesWritten;
  } catch (error) {
    out.destroy();
    await fs.unlink(destPath).catch(() => undefined);
    throw error;
  }
}
