/**
 * Archives built for tests, written to disk as they are made, and read back.
 *
 * A zip bomb is a few hundred kilobytes that unpacks to hundreds of
 * megabytes. Building one in memory would cost the test what it is meant to
 * prove the server does not spend, so every entry here is streamed through
 * yazl into a file.
 */

import fs from 'fs';
import { Readable } from 'stream';
import { buffer } from 'stream/consumers';
import { pipeline } from 'stream/promises';
import { ZipFile } from 'yazl';
import { fromBufferPromise, openPromise } from 'yauzl';

export interface FixtureEntry {
  /** A name ending in a slash makes a folder entry, whose data is left out. */
  name: string;
  /** The entry's content, or a function giving a fresh stream of it. */
  data: string | Buffer | (() => Readable);
  /** Store the entry without compressing it. */
  store?: boolean;
  /** The entry's Unix mode, its file type included: 0o120777 makes it a symbolic link. */
  mode?: number;
  /** The entry's comment, the last bytes of its record in the central directory. */
  comment?: Buffer;
}

/**
 * A ZIP of `entries`, its entries compressed at zlib's highest level unless
 * stored. With `zip64`, every entry and the end of the archive carry the
 * ZIP64 fields an archive past 4 GB or 65,535 entries has.
 */
function zipOf(entries: FixtureEntry[], zip64 = false, comment?: string): ZipFile {
  const zip = new ZipFile();
  for (const entry of entries) {
    const options = {
      compressionLevel: entry.store ? 0 : 9,
      forceZip64Format: zip64,
      ...(entry.mode === undefined ? {} : { mode: entry.mode }),
      ...(entry.comment === undefined ? {} : { fileComment: entry.comment }),
    };
    if (entry.name.endsWith('/')) zip.addEmptyDirectory(entry.name, entry.mode === undefined ? {} : { mode: entry.mode });
    else if (typeof entry.data === 'function') zip.addReadStream(entry.data(), entry.name, options);
    else zip.addBuffer(Buffer.from(entry.data), entry.name, options);
  }
  zip.end({ forceZip64Format: zip64, ...(comment === undefined ? {} : { comment }) });
  return zip;
}

/** A ZIP holding the given files, in memory. */
export async function zipBuffer(files: Record<string, string>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of zipOf(Object.entries(files).map(([name, data]) => ({ name, data }))).outputStream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** A stream of `bytes` copies of one byte, made a megabyte at a time. */
export function repeatedBytes(bytes: number, fill = 0x20): Readable {
  const chunk = Buffer.alloc(1024 * 1024, fill);
  let left = bytes;
  return new Readable({
    read() {
      if (left <= 0) {
        this.push(null);
        return;
      }
      const piece = left >= chunk.length ? chunk : chunk.subarray(0, left);
      left -= piece.length;
      this.push(piece);
    },
  });
}

/**
 * Write a ZIP of `entries` to `dest`, with ZIP64 fields throughout if
 * `zip64`, and the archive's own `comment` at its very end.
 */
export async function writeZip(dest: string, entries: FixtureEntry[], options: { zip64?: boolean; comment?: string } = {}): Promise<void> {
  await pipeline(zipOf(entries, options.zip64, options.comment).outputStream, fs.createWriteStream(dest));
}

/** Where the central directory record of `entryName` starts in `bytes`. */
function directoryRecordOf(bytes: Buffer, entryName: string, zipPath: string): number {
  const name = Buffer.from(entryName, 'utf8');
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  for (let at = bytes.indexOf(signature); at !== -1; at = bytes.indexOf(signature, at + 1)) {
    const nameLength = bytes.readUInt16LE(at + 28);
    if (nameLength === name.length && bytes.subarray(at + 46, at + 46 + nameLength).equals(name)) return at;
  }
  throw new Error(`${entryName} is not in the central directory of ${zipPath}`);
}

/** Where the local header of `entryName` starts in `bytes`, as its directory record says. */
function localHeaderOf(bytes: Buffer, entryName: string, zipPath: string): number {
  return bytes.readUInt32LE(directoryRecordOf(bytes, entryName, zipPath) + 42);
}

/**
 * Rewrite what the archive's central directory says an entry unpacks to.
 *
 * An archive can claim any size it likes there; only unpacking it shows the
 * truth. This makes a bomb whose directory says it is small.
 */
export function claimUnpackedSize(zipPath: string, entryName: string, claimed: number): void {
  const bytes = fs.readFileSync(zipPath);
  bytes.writeUInt32LE(claimed, directoryRecordOf(bytes, entryName, zipPath) + 24);
  fs.writeFileSync(zipPath, bytes);
}

/** Rewrite what the archive's central directory says an entry's packed bytes take. */
export function claimPackedSize(zipPath: string, entryName: string, claimed: number): void {
  const bytes = fs.readFileSync(zipPath);
  bytes.writeUInt32LE(claimed, directoryRecordOf(bytes, entryName, zipPath) + 20);
  fs.writeFileSync(zipPath, bytes);
}

/**
 * Rewrite the ZIP64 field of an entry's central directory record, which an
 * archive written with `zip64` has: the size of its packed bytes, or where
 * its local header starts. Either can claim more than any file holds.
 */
export function claimZip64Field(zipPath: string, entryName: string, field: 'compressedSize' | 'localHeaderOffset', claimed: bigint): void {
  const bytes = fs.readFileSync(zipPath);
  const record = directoryRecordOf(bytes, entryName, zipPath);
  const extraStart = record + 46 + bytes.readUInt16LE(record + 28);
  const extraEnd = extraStart + bytes.readUInt16LE(record + 30);
  for (let at = extraStart; at + 4 <= extraEnd; at += 4 + bytes.readUInt16LE(at + 2)) {
    if (bytes.readUInt16LE(at) !== 0x0001) continue;
    // Its fields, in order: the unpacked size, the packed size, the local header's offset.
    bytes.writeBigUInt64LE(claimed, at + (field === 'compressedSize' ? 12 : 20));
    fs.writeFileSync(zipPath, bytes);
    return;
  }
  throw new Error(`${entryName} has no ZIP64 field in ${zipPath}`);
}

/**
 * Rewrite the length of the extra field in an entry's local header, which
 * moves where its packed bytes are read from.
 */
export function claimLocalExtraLength(zipPath: string, entryName: string, claimed: number): void {
  const bytes = fs.readFileSync(zipPath);
  bytes.writeUInt16LE(claimed, localHeaderOf(bytes, entryName, zipPath) + 28);
  fs.writeFileSync(zipPath, bytes);
}

/**
 * Rewrite an entry's general purpose flags or its compression method, in its
 * local header and in the directory: flag 0x1 marks it encrypted.
 */
export function rewriteEntryHeader(zipPath: string, entryName: string, fields: { flags?: number; compressionMethod?: number }): void {
  const bytes = fs.readFileSync(zipPath);
  const record = directoryRecordOf(bytes, entryName, zipPath);
  const local = localHeaderOf(bytes, entryName, zipPath);
  if (fields.flags !== undefined) {
    bytes.writeUInt16LE(fields.flags, record + 8);
    bytes.writeUInt16LE(fields.flags, local + 6);
  }
  if (fields.compressionMethod !== undefined) {
    bytes.writeUInt16LE(fields.compressionMethod, record + 10);
    bytes.writeUInt16LE(fields.compressionMethod, local + 8);
  }
  fs.writeFileSync(zipPath, bytes);
}

/** Overwrite the signature of an entry's local header, as in a damaged archive. */
export function damageLocalHeader(zipPath: string, entryName: string): void {
  const bytes = fs.readFileSync(zipPath);
  bytes.fill(0, localHeaderOf(bytes, entryName, zipPath), localHeaderOf(bytes, entryName, zipPath) + 4);
  fs.writeFileSync(zipPath, bytes);
}

/**
 * Overwrite the start of an entry's packed bytes, after its local header's
 * name and extra field, with a block type deflate does not have.
 */
export function damagePackedData(zipPath: string, entryName: string): void {
  const bytes = fs.readFileSync(zipPath);
  const local = localHeaderOf(bytes, entryName, zipPath);
  const dataAt = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
  bytes.fill(0xff, dataAt, dataAt + 16);
  fs.writeFileSync(zipPath, bytes);
}

/** Point the archive's end-of-directory record at a directory past the end of the file. */
export function moveDirectoryPastEnd(zipPath: string): void {
  const bytes = fs.readFileSync(zipPath);
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end === -1) throw new Error(`${zipPath} has no end-of-directory record`);
  bytes.writeUInt32LE(bytes.length + 1000, end + 16);
  fs.writeFileSync(zipPath, bytes);
}

/** An archive of `count` tiny entries, for the entry-count limit. */
export async function writeManyEntryZip(dest: string, count: number, first: FixtureEntry[] = []): Promise<void> {
  const entries: FixtureEntry[] = [...first];
  for (let i = entries.length; i < count; i++) entries.push({ name: `filler/${i}.txt`, data: 'x', store: true });
  await writeZip(dest, entries);
}

/**
 * Rename an entry in place, in its local header and in the directory. The new
 * name must be as long as the old one. yazl refuses a name that tries to
 * leave the folder it is unpacked into, so one has to be put there
 * afterwards.
 */
export function renameEntry(zipPath: string, from: string, to: string): void {
  const a = Buffer.from(from, 'utf8');
  const b = Buffer.from(to, 'utf8');
  if (a.length !== b.length) throw new Error('renameEntry needs names of the same length');
  const bytes = fs.readFileSync(zipPath);
  let found = 0;
  for (let at = bytes.indexOf(a); at !== -1; at = bytes.indexOf(a, at + a.length)) {
    b.copy(bytes, at);
    found += 1;
  }
  if (found === 0) throw new Error(`${from} is not in ${zipPath}`);
  fs.writeFileSync(zipPath, bytes);
}

/**
 * A ZIP64 archive whose end records say it lists `listed` entries, with one
 * real entry. Only the end of it is meant to be read.
 */
export function writeZip64Claiming(dest: string, listed: bigint): void {
  const local = Buffer.alloc(31);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(45, 4);
  local.writeUInt16LE(1, 26);
  local.write('a', 30);
  const record = Buffer.alloc(47);
  record.writeUInt32LE(0x02014b50, 0);
  record.writeUInt16LE(45, 4);
  record.writeUInt16LE(45, 6);
  record.writeUInt16LE(1, 28);
  record.write('a', 46);
  const directoryAt = local.length;
  const zip64At = directoryAt + record.length;
  const zip64 = Buffer.alloc(56);
  zip64.writeUInt32LE(0x06064b50, 0);
  zip64.writeBigUInt64LE(44n, 4);
  zip64.writeUInt16LE(45, 12);
  zip64.writeUInt16LE(45, 14);
  zip64.writeBigUInt64LE(listed, 24);
  zip64.writeBigUInt64LE(listed, 32);
  zip64.writeBigUInt64LE(BigInt(record.length), 40);
  zip64.writeBigUInt64LE(BigInt(directoryAt), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(zip64At), 8);
  locator.writeUInt32LE(1, 16);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0xffff, 8);
  end.writeUInt16LE(0xffff, 10);
  end.writeUInt32LE(0xffffffff, 12);
  end.writeUInt32LE(0xffffffff, 16);
  fs.writeFileSync(dest, Buffer.concat([local, record, zip64, locator, end]));
}

/** An entry read back from an archive, with what it unpacks to. */
export interface ReadBackEntry {
  path: string;
  /** A folder entry, whose name ends in a slash, or a file. */
  type: 'File' | 'Directory';
  compressionMethod: number;
  uncompressedSize: number;
  data: Buffer;
}

/**
 * Every entry of an archive, a file's path or its bytes, unpacked in memory.
 * yauzl reads it with all its own checks on (names, sizes against what each
 * entry unpacks to, the end record), apart from the server's reader, so an
 * archive the server writes is held to them too.
 */
export async function readZip(source: string | Buffer): Promise<ReadBackEntry[]> {
  const zip = typeof source === 'string' ? await openPromise(source) : await fromBufferPromise(source);
  const entries: ReadBackEntry[] = [];
  try {
    for await (const entry of zip.eachEntry()) {
      entries.push({
        path: entry.fileName,
        type: entry.fileName.endsWith('/') ? 'Directory' : 'File',
        compressionMethod: entry.compressionMethod,
        uncompressedSize: entry.uncompressedSize,
        data: await buffer(await zip.openReadStreamPromise(entry)),
      });
    }
  } finally {
    zip.close();
  }
  return entries;
}
