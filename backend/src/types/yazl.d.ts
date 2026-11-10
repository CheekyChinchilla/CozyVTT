/**
 * The part of yazl, which writes ZIP archives, that the backend and its
 * tests use. The package ships no types of its own.
 */
declare module 'yazl' {
  import { EventEmitter } from 'events';
  import type { Readable } from 'stream';

  export interface EntryOptions {
    /** When the entry was last changed; now, if not given. */
    mtime?: Date;
    /** The entry's Unix mode, its file type included; 0o100664 if not given. */
    mode?: number;
    /** Deflate the entry, as it is by default, or store it as it is. */
    compress?: boolean;
    /** zlib's level for the entry, 0 (stored) to 9; 6 if not given. */
    compressionLevel?: number;
    /** Give the entry ZIP64 fields whatever its size, as one past 4 GB gets them. */
    forceZip64Format?: boolean;
  }

  export class ZipFile extends EventEmitter<{ error: [Error] }> {
    /** The archive's bytes, as they are written. */
    readonly outputStream: Readable;
    addBuffer(buffer: Buffer, metadataPath: string, options?: EntryOptions): void;
    /** A folder entry, its name ending in a slash. */
    addEmptyDirectory(metadataPath: string, options?: Pick<EntryOptions, 'mtime' | 'mode'>): void;
    /** The entry's content is read from `readStream` when its turn comes. */
    addReadStream(readStream: Readable, metadataPath: string, options?: EntryOptions): void;
    /**
     * The entry's content is read from the stream `getReadStream` hands back
     * when the entry's turn comes; yazl keeps only the function.
     */
    addReadStreamLazy(
      metadataPath: string,
      options: EntryOptions,
      getReadStream: (done: { (error: Error): void; (error: null, readStream: Readable): void }) => void
    ): void;
    /**
     * No more entries: write the central directory and end `outputStream`,
     * with the ZIP64 end records whatever the count if `forceZip64Format`.
     */
    end(options?: { forceZip64Format?: boolean }): void;
  }
}
