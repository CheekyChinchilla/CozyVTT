/**
 * Writing a ZIP archive: an instance backup (routes/admin.ts) and a campaign
 * export (services/campaignExporter.ts). Restoring a backup and importing a
 * campaign read what this writes (utils/archive.ts).
 *
 * The archive goes to its stream as it is made, never held whole, and each
 * file is opened only when its turn comes, so an archive of thousands of
 * uploads holds one of them open at a time. A file over 4 GB, or an archive
 * past 4 GB or 65,535 entries, is written in ZIP64 by itself.
 *
 * yazl finds the entry to write next by looking through every entry before
 * it, so the time an archive takes grows with the square of its entries. A
 * backup of one-byte files, stored, took 3 s for 10,000, 18 s for 40,000,
 * 63 s for 80,000 and 113 s for 100,000 (the most a restore takes), in 275 MB
 * at most, where archiver took about 9 s for 40,000. The event loop was never
 * held for more than about a tenth of a second.
 */
import { constants, type ReadStream, type Stats } from 'fs';
import fs, { type FileHandle } from 'fs/promises';
import { Transform, type Writable } from 'stream';
import { finished, pipeline } from 'stream/promises';
import { ZipFile } from 'yazl';
import { errorCode, errorMessage } from './errors';
import logger from './logger';

/** One entry of an archive: a file on disk, or text made for the archive. */
export type ZipEntrySource =
  | {
      /** The entry's name in the archive, with forward slashes. */
      name: string;
      file: string;
      /** Store the file as it is, without compressing it. */
      store?: boolean;
      /**
       * Leave the entry out if, when its turn comes, the file is gone or is
       * no longer a regular file: it was deleted or replaced after it was
       * listed. Without this, either stops the archive.
       */
      skipIfGone?: boolean;
    }
  | { name: string; content: string; store?: boolean };

/** A file going into an archive could not be read. */
export class ZipInputError extends Error {
  constructor(readonly file: string, cause: unknown) {
    super(`${file} could not be read for the archive: ${errorMessage(cause) ?? 'unknown error'}`, { cause });
    this.name = 'ZipInputError';
  }
}

// O_NOFOLLOW refuses a link in the place of the file's own name, and guards
// nothing else: a folder on the way replaced by a link after the file was
// listed is followed, which takes write access to the server's disk. Windows
// has neither flag. O_NONBLOCK keeps a named pipe from holding the open until
// something writes to it; it changes nothing for a regular file.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/**
 * Open `file` to read it, if it is a regular file and its own name is not a
 * symbolic link. Null if it is gone or is not a regular file.
 */
async function openRegularFile(file: string): Promise<{ handle: FileHandle; stats: Stats } | null> {
  let handle: FileHandle;
  try {
    handle = await fs.open(file, OPEN_FLAGS);
  } catch (error) {
    // ELOOP: the file is a symbolic link.
    if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ELOOP') return null;
    throw new ZipInputError(file, error);
  }
  try {
    const stats = await handle.stat();
    if (stats.isFile()) return { handle, stats };
  } catch (error) {
    await handle.close().catch(() => {});
    throw new ZipInputError(file, error);
  }
  await handle.close().catch(() => {});
  return null;
}

/**
 * Write an archive of `entries`, in their order, to `out`, resolving with
 * the number of bytes written once `out` has taken all of them. A file that
 * cannot be read rejects with ZipInputError; `out` failing or closing early
 * rejects with its own error. Either way the file being read is closed and
 * no more are opened.
 */
export async function writeZipTo(out: Writable, entries: Iterable<ZipEntrySource>): Promise<number> {
  const zip = new ZipFile();
  const archive = zip.outputStream;
  let bytes = 0;
  const counted = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      done(null, chunk);
    },
  });
  /** The file being read into the archive. */
  let reading: ReadStream | null = null;

  // yazl reports a failure of its own here; it ends the archive like any other.
  zip.on('error', (error) => archive.destroy(error));
  const written = pipeline(archive, counted, out);
  // When `out` fails, nothing reads the file any more, and it would stay open.
  written.catch(() => reading?.destroy());

  // Settles once every entry is added or the archive has stopped; it never rejects.
  const added = (async () => {
    try {
      for (const entry of entries) {
        if (archive.destroyed) return;
        const options = { compress: !entry.store };
        if (!('file' in entry)) {
          zip.addBuffer(Buffer.from(entry.content), entry.name, options);
          continue;
        }
        const opened = await openRegularFile(entry.file);
        if (opened === null) {
          if (!entry.skipIfGone) throw new ZipInputError(entry.file, new Error('it is missing, or is not a regular file'));
          logger.warn('Left a file out of an archive: it is gone, or is no longer a regular file', { file: entry.file });
          continue;
        }
        if (archive.destroyed) {
          await opened.handle.close().catch(() => {});
          return;
        }
        reading = opened.handle.createReadStream();
        // yazl keeps what it is given for each entry until the archive ends,
        // and a stream kept for every file of a large backup ran the backend
        // out of memory. It is given a function that lets go of the stream
        // once yazl has taken it, when the entry's turn comes.
        const handOver: { stream: ReadStream | null } = { stream: reading };
        zip.addReadStreamLazy(entry.name, { ...options, mtime: opened.stats.mtime, mode: opened.stats.mode }, (done) => {
          const stream = handOver.stream;
          handOver.stream = null;
          if (stream === null) done(new Error(`yazl asked twice for ${entry.name}`));
          else done(null, stream);
        });
        // yazl writes one entry at a time, so the next file is opened only
        // once this one has been read.
        await finished(reading).catch((error: unknown) => {
          throw new ZipInputError(entry.file, error);
        });
        reading = null;
      }
      zip.end();
    } catch (error) {
      // Once the archive has stopped, the error here is only its echo.
      if (!archive.destroyed) archive.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  await added;
  await written;
  return bytes;
}
