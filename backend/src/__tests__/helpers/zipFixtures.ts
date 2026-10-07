/**
 * Archives built for tests, written to disk as they are made.
 *
 * A zip bomb is a few hundred kilobytes that unpacks to hundreds of
 * megabytes. Building one in memory would cost the test what it is meant to
 * prove the server does not spend, so every entry here is streamed through
 * archiver into a file.
 */

import fs from 'fs';
import { Readable } from 'stream';
import archiver from 'archiver';

export interface FixtureEntry {
  name: string;
  /** The entry's content, or a function giving a fresh stream of it. */
  data: string | Buffer | (() => Readable);
  /** Store the entry without compressing it. */
  store?: boolean;
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

/** Write a ZIP of `entries` to `dest`. */
export async function writeZip(dest: string, entries: FixtureEntry[]): Promise<void> {
  const out = fs.createWriteStream(dest);
  const closed = new Promise<void>((resolve, reject) => {
    out.on('close', () => resolve());
    out.on('error', reject);
  });
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => out.destroy(err));
  archive.pipe(out);
  for (const entry of entries) {
    const data = typeof entry.data === 'function' ? entry.data() : entry.data;
    archive.append(data, { name: entry.name, store: entry.store ?? false });
  }
  await archive.finalize();
  await closed;
}

/**
 * Rewrite what the archive's central directory says an entry unpacks to.
 *
 * An archive can claim any size it likes there; only unpacking it shows the
 * truth. This makes a bomb whose directory says it is small.
 */
export function claimUnpackedSize(zipPath: string, entryName: string, claimed: number): void {
  const bytes = fs.readFileSync(zipPath);
  const name = Buffer.from(entryName, 'utf8');
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  for (let at = bytes.indexOf(signature); at !== -1; at = bytes.indexOf(signature, at + 1)) {
    const nameLength = bytes.readUInt16LE(at + 28);
    if (nameLength === name.length && bytes.subarray(at + 46, at + 46 + nameLength).equals(name)) {
      bytes.writeUInt32LE(claimed, at + 24);
      fs.writeFileSync(zipPath, bytes);
      return;
    }
  }
  throw new Error(`${entryName} is not in the central directory of ${zipPath}`);
}

/** An archive of `count` tiny entries, for the entry-count limit. */
export async function writeManyEntryZip(dest: string, count: number, first: FixtureEntry[] = []): Promise<void> {
  const entries: FixtureEntry[] = [...first];
  for (let i = entries.length; i < count; i++) entries.push({ name: `filler/${i}.txt`, data: 'x', store: true });
  await writeZip(dest, entries);
}

/**
 * Rename an entry in place, in its local header and in the directory. The new
 * name must be as long as the old one. archiver cleans the names it writes,
 * so a name that tries to leave the folder it is unpacked into has to be put
 * there afterwards.
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
