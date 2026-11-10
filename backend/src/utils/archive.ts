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
import { once } from 'events';
import { createReadStream, type WriteStream } from 'fs';
import fs from 'fs/promises';
import { Readable, Transform, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { fromFdPromise, type Entry as DirectoryRecord, type ZipFile } from 'yauzl';
import { errorCode } from './errors';

/**
 * The longest entry name, in bytes, an archive may have. The reader keeps
 * every name of a directory in memory, and a name can be 65,535 bytes, so
 * an import of 1,000 such names held about 131 MB. CozyVTT writes at most
 * about 320 bytes: a backup's uploads (`uploads/`, three folders and a
 * stored file's name, which the file system holds to 255 bytes) and an
 * export's assets (`assets/`, the asset's id and an extension of at most 20
 * characters). A backup leaves out a longer name, as it does any other this
 * check refuses.
 */
export const MAX_ARCHIVE_NAME_BYTES = 1024;

/**
 * Reject archive entry paths that attempt traversal or absolute escape, or
 * are longer than MAX_ARCHIVE_NAME_BYTES.
 * Accepts only simple relative paths that stay beneath the extraction root.
 */
export function isSafeArchivePath(name: string): boolean {
  if (!name) return false;
  if (Buffer.byteLength(name, 'utf8') > MAX_ARCHIVE_NAME_BYTES) return false;
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

/** A byte count in GiB for a message, such as "10 GiB". */
function gibibytes(bytes: number): string {
  const gib = bytes / (1024 * 1024 * 1024);
  return gib >= 1 ? `${Number.isInteger(gib) ? gib : gib.toFixed(1)} GiB` : `${Math.ceil(bytes / (1024 * 1024))} MiB`;
}

/**
 * What the file system says when an archive names a file it cannot make:
 * a folder in its place (EISDIR), a file where a folder is needed (ENOTDIR,
 * EEXIST), or a part of the name too long (ENAMETOOLONG).
 */
const NAME_CANNOT_BE_WRITTEN = new Set(['EISDIR', 'ENOTDIR', 'EEXIST', 'ENAMETOOLONG']);

/**
 * A stream writing a file at `destPath`, its file already open. A stream
 * left to open its own file reports a failure as an 'error' event, and one
 * that comes before anything listens ends the process; this rejects instead.
 */
async function openNewFile(destPath: string, flags: 'w' | 'wx'): Promise<WriteStream> {
  const handle = await fs.open(destPath, flags);
  return handle.createWriteStream();
}

/** Stop `out` and wait for its file to close, listening for any error closing it. */
async function discard(out: WriteStream): Promise<void> {
  if (out.closed) return;
  const closed = once(out, 'close').catch(() => undefined);
  out.destroy();
  await closed;
}

/**
 * Extract every file entry in `directory`, the directory of the archive at
 * `archivePath`, beneath `destRoot`, streaming each to disk. Throws
 * ArchiveRefusedError if any entry escapes `destRoot`, names a file that
 * cannot be written there, the entry count exceeds `maxFiles`, or an entry
 * cannot be read, and ArchiveLimitError ('total') if
 * the running decompressed total exceeds `maxTotalBytes`, each with a message
 * for the person who sent the archive.
 *
 * Each entry is unpacked with unpackEntry, which closes the archive file
 * whenever it stops, so a refused archive leaves no handle to it open.
 *
 * Directory entries are created implicitly from each file's parent path.
 * Symlink entries are not honored: only file contents are written, so an
 * archive cannot plant a symlink and follow it out of `destRoot`.
 */
export async function extractArchiveSafely(
  archivePath: string,
  directory: ArchiveDirectory,
  destRoot: string,
  options: SafeExtractOptions
): Promise<void> {
  const fileEntries = directory.files.filter((f) => f.type === 'File');
  if (fileEntries.length > options.maxFiles) {
    throw new ArchiveRefusedError(
      `The archive holds ${fileEntries.length.toLocaleString('en-US')} files, more than the ${options.maxFiles.toLocaleString('en-US')} it may hold.`
    );
  }

  const resolvedRoot = path.resolve(destRoot);
  // One entry may use the whole allowance, so its own limit is the total's.
  const limits: EntryLimits = { maxEntryBytes: options.maxTotalBytes, total: new UnpackedTotal(options.maxTotalBytes) };

  // A backup unpacks its whole database here, so a folder this creates is its
  // user's alone. The files keep the default mode: a restore copies the
  // uploads among them into the uploads folder, and each copy keeps its mode.
  await fs.mkdir(resolvedRoot, { recursive: true, mode: 0o700 });

  for (const entry of fileEntries) {
    if (!isSafeArchivePath(entry.path)) {
      throw new ArchiveRefusedError(`The archive has an unsafe file path, which a backup never has: ${entry.path}`);
    }

    const destPath = path.resolve(destRoot, entry.path);
    // Defense in depth: the resolved path must stay within destRoot even if the
    // string checks above are ever bypassed by a platform-specific quirk.
    if (destPath !== resolvedRoot && !destPath.startsWith(resolvedRoot + path.sep)) {
      throw new ArchiveRefusedError(`The archive has an unsafe file path, which a backup never has: ${entry.path}`);
    }

    // A name the folder cannot take: the folder itself ("./" with content),
    // a file where an earlier entry made a folder or the other way round, or
    // a part of the name longer than the file system allows.
    const cannotBeWritten = () => new ArchiveRefusedError(`The archive is damaged, or holds a file name that cannot be written: ${entry.path}`);
    if (destPath === resolvedRoot) throw cannotBeWritten();
    let out: WriteStream;
    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      out = await openNewFile(destPath, 'w');
    } catch (error) {
      if (NAME_CANNOT_BE_WRITTEN.has(errorCode(error) ?? '')) throw cannotBeWritten();
      throw error;
    }

    // Decompressed bytes are counted as they flow, so a zip bomb is stopped
    // part-way and never lands on disk whole.
    try {
      await unpackEntry(archivePath, entry, limits, out);
    } catch (error) {
      await discard(out);
      if (error instanceof ArchiveLimitError) {
        throw new ArchiveLimitError(`The archive unpacks to more than the ${gibibytes(options.maxTotalBytes)} a backup may hold.`, 'total');
      }
      throw error;
    }
  }
}

// ── Reading an untrusted archive in bounded memory ──────────────────────────
//
// An archive says how many entries it has and how large each one unpacks to,
// and either can be a lie. Reading the directory costs memory for every entry
// it lists, so a small archive listing a million entries would need more
// memory than the backend has, and an entry can unpack to a thousand times
// its packed size. So the entry count is taken from the archive's end before
// any entry of the directory is read, and every entry is unpacked through a
// counter that stops it the moment it passes its limit.
//
// yauzl reads the directory: it finds the end-of-directory record (and the
// ZIP64 one it points to) and reads exactly the number of entries that record
// lists, one at a time. The count checked is that same number, so no record
// the reader goes on to use can escape the check. Unpacking is done here.

const LOCAL_FILE_HEADER = 0x04034b50;

/** One entry of an archive's directory. */
export interface ArchiveEntry {
  /** The entry's name, read as UTF-8; checked by isSafeArchivePath before use. */
  path: string;
  /** A folder is an empty entry whose name ends in a slash. */
  type: 'File' | 'Directory';
  compressedSize: number;
  /** What the directory claims the entry unpacks to, which can be a lie. */
  uncompressedSize: number;
  /** The general purpose flags: bit 0 marks an encrypted entry. */
  flags: number;
  compressionMethod: number;
  offsetToLocalFileHeader: number;
}

/** An archive's directory: every entry it lists, in order. */
export interface ArchiveDirectory {
  files: ArchiveEntry[];
}

/**
 * An archive the server will not read, with a message for the person who
 * sent it. Any other error while reading one is the server's own failure,
 * and its message is not for them.
 */
export class ArchiveRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveRefusedError';
  }
}

/** Why reading an archive stopped. */
export class ArchiveLimitError extends ArchiveRefusedError {
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
 * Open the archive at `filePath` and hand `read` its reader, which has found
 * the archive's end and read no entry yet. A file that cannot be opened
 * throws as the file system says; one whose end cannot be found is refused.
 */
async function withArchive<T>(filePath: string, read: (zip: ZipFile) => Promise<T>): Promise<T> {
  const handle = await fs.open(filePath, 'r');
  try {
    let zip: ZipFile;
    try {
      // Names are read as bytes and decoded below, so isSafeArchivePath
      // judges every name and a refusal names it. Sizes are checked as each
      // entry unpacks. With autoClose off, the reader never closes the file:
      // this handle does.
      zip = await fromFdPromise(handle.fd, { decodeStrings: false, validateEntrySizes: false, autoClose: false });
    } catch {
      throw new ArchiveRefusedError(NOT_A_ZIP);
    }
    return await read(zip);
  } finally {
    await handle.close();
  }
}

/**
 * One directory record as an ArchiveEntry, keeping none of its buffers.
 * A record whose entry cannot lie inside the archive's `fileSize` bytes is
 * refused: a ZIP64 field can claim an offset or size near 2^64, which reading
 * the file there would fail on, and a stored entry claiming more bytes than
 * follow its header would be read on into the rest of the archive.
 */
function entryOf(record: DirectoryRecord, fileSize: number): ArchiveEntry {
  if (record.relativeOffsetOfLocalHeader + 30 + record.compressedSize > fileSize) {
    throw new ArchiveRefusedError(NOT_A_ZIP);
  }
  // Refused before it is kept, and without repeating it.
  if (record.fileNameRaw.length > MAX_ARCHIVE_NAME_BYTES) {
    throw new ArchiveRefusedError(
      `The archive has a file name longer than ${MAX_ARCHIVE_NAME_BYTES.toLocaleString('en-US')} bytes, which an archive from this server never has.`
    );
  }
  const name = record.fileNameRaw.toString('utf8');
  return {
    path: name,
    type: record.uncompressedSize === 0 && /[/\\]$/.test(name) ? 'Directory' : 'File',
    compressedSize: record.compressedSize,
    uncompressedSize: record.uncompressedSize,
    flags: record.generalPurposeBitFlag,
    compressionMethod: record.compressionMethod,
    offsetToLocalFileHeader: record.relativeOffsetOfLocalHeader,
  };
}

/**
 * How many entries an archive's directory lists, read from its end-of-
 * directory record, or the ZIP64 record it points to, as the reader reads it.
 */
export async function countListedEntries(filePath: string): Promise<number> {
  return withArchive(filePath, async (zip) => zip.entryCount);
}

/**
 * Read the directory of an archive on disk, refusing one that lists more than
 * `maxEntries` entries before any entry is read.
 */
export async function openArchiveFile(filePath: string, maxEntries: number): Promise<ArchiveDirectory> {
  return withArchive(filePath, async (zip) => {
    if (zip.entryCount > maxEntries) {
      throw new ArchiveRefusedError(
        `The archive lists ${zip.entryCount.toLocaleString('en-US')} files, more than the ${maxEntries.toLocaleString('en-US')} it may hold.`
      );
    }
    const files: ArchiveEntry[] = [];
    try {
      for await (const record of zip.eachEntry()) files.push(entryOf(record, zip.fileSize));
    } catch (error) {
      if (error instanceof ArchiveRefusedError) throw error;
      // The end of the archive was found but its directory cannot be read.
      throw new ArchiveRefusedError(NOT_A_ZIP);
    }
    return { files };
  });
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
 * stream is in one pipeline, so a stopped entry closes the archive file. A
 * stream that left it open when stopped part-way would let a few hundred
 * refused entries use up the process's files.
 *
 * A file `destination` is opened before it comes here (openNewFile): the
 * quick refusals below destroy it, and a file still being opened then would
 * fail later with no one listening, once its folder had been removed.
 */
async function unpackEntry(archivePath: string, entry: ArchiveEntry, limits: EntryLimits, destination: Writable): Promise<void> {
  // The size the directory claims is a quick refusal, never the only check.
  if (entry.uncompressedSize > limits.maxEntryBytes) {
    destination.destroy();
    throw new ArchiveLimitError(`${entry.path} unpacks to more than the ${limits.maxEntryBytes} bytes it may hold`, 'entry');
  }
  if (entry.flags & 0x1) {
    destination.destroy();
    throw new ArchiveRefusedError(`${entry.path} is encrypted, which an archive from this server never is.`);
  }
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    destination.destroy();
    throw new ArchiveRefusedError(`${entry.path} is packed in a way this server cannot read.`);
  }

  const handle = await fs.open(archivePath, 'r');
  let start: number;
  try {
    const header = await readAt(handle, entry.offsetToLocalFileHeader, 30);
    const damaged = header.length < 30 || header.readUInt32LE(0) !== LOCAL_FILE_HEADER;
    start = damaged ? 0 : entry.offsetToLocalFileHeader + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    // The local header's name and extra field can push the packed bytes past
    // the end, which the directory alone does not show.
    if (damaged || start + entry.compressedSize > (await handle.stat()).size) {
      destination.destroy();
      throw new ArchiveRefusedError(`The archive is damaged: ${entry.path} cannot be read.`);
    }
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

  if (entry.compressionMethod !== 8) {
    await pipeline(packed, counter, destination);
    return;
  }
  try {
    await pipeline(packed, zlib.createInflateRaw(), counter, destination);
  } catch (error) {
    // Packed bytes that do not inflate are the archive's fault, not the
    // server's; zlib names its errors Z_DATA_ERROR and the like.
    const code = typeof error === 'object' && error !== null ? (error as NodeJS.ErrnoException).code : undefined;
    if (typeof code === 'string' && code.startsWith('Z_')) {
      throw new ArchiveRefusedError(`The archive is damaged: ${entry.path} cannot be read.`);
    }
    throw error;
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
  // Opened before the entry is read, so a quick refusal below cannot leave
  // a file still opening once its folder is removed.
  const out = await openNewFile(destPath, 'wx');
  try {
    await unpackEntry(archivePath, entry, limits, out);
    return out.bytesWritten;
  } catch (error) {
    await discard(out);
    await fs.unlink(destPath).catch(() => undefined);
    throw error;
  }
}
