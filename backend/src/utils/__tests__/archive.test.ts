import fs from 'fs/promises';
import { readdirSync } from 'fs';
import os from 'os';
import path from 'path';
import archiver from 'archiver';
import unzipper from 'unzipper';
import {
  extractArchiveSafely,
  isSafeArchivePath,
  countListedEntries,
  openArchiveFile,
  readArchiveEntry,
  writeArchiveEntry,
  ArchiveLimitError,
  UnpackedTotal,
} from '../archive';
import { expectFileMode } from '../../__tests__/helpers/fileModes';
import {
  writeZip,
  repeatedBytes,
  claimUnpackedSize,
  renameEntry,
  writeManyEntryZip,
  writeZip64Claiming,
} from '../../__tests__/helpers/zipFixtures';

const MB = 1024 * 1024;

/** A ZIP holding the given files. */
async function zipOf(entries: Record<string, string>): Promise<Buffer> {
  const archive = archiver('zip');
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', reject);
  });
  for (const [name, body] of Object.entries(entries)) archive.append(body, { name });
  await archive.finalize();
  await ended;
  return Buffer.concat(chunks);
}

const LIMITS = { maxFiles: 10, maxTotalBytes: 1024 * 1024 };

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-archive-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

/** Every file under `dir`, relative to it. */
async function filesUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const name of (await fs.readdir(dir, { recursive: true })) as string[]) {
    if ((await fs.lstat(path.join(dir, name))).isFile()) found.push(name);
  }
  return found.sort();
}

describe('isSafeArchivePath', () => {
  it.each([
    ['manifest.json'],
    ['maps/map-0.json'],
    ['assets/0b6e5b0c-9a0e-4c1e-8f43-2f1b0b8e2a11.png'],
  ])('accepts %s', (name) => {
    expect(isSafeArchivePath(name)).toBe(true);
  });

  it.each([
    ['an empty name', ''],
    ['a parent folder', '../evil.txt'],
    ['a parent folder further in', 'maps/../../evil.txt'],
    ['a name that only normalises outside', 'a/b/../../../evil.txt'],
    ['a backslash', 'maps\\evil.txt'],
    ['a backslash parent folder', '..\\evil.txt'],
    ['an absolute path', '/etc/passwd'],
  ])('refuses %s', (_label, name) => {
    expect(isSafeArchivePath(name)).toBe(false);
  });
});

// A restore unpacks a whole backup, database dump included, under the
// system's temporary folder, which on a host without Docker every local
// account can read.
describe('extractArchiveSafely', () => {
  it('creates the folder it unpacks into readable by its owner alone', async () => {
    const dest = path.join(root, 'unpacked');
    const directory = await unzipper.Open.buffer(await zipOf({ 'database.sql': 'SELECT 1;\n', 'uploads/a/b.txt': 'b' }));

    await extractArchiveSafely(directory, dest, LIMITS);

    await expectFileMode(dest, 0o077, 0);
    expect(await fs.readFile(path.join(dest, 'database.sql'), 'utf8')).toBe('SELECT 1;\n');
    expect(await fs.readFile(path.join(dest, 'uploads/a/b.txt'), 'utf8')).toBe('b');
  });

  it('refuses an archive with more files than allowed, writing nothing', async () => {
    const dest = path.join(root, 'unpacked');
    const many = Object.fromEntries(Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => [`f${i}.txt`, 'x']));
    const directory = await unzipper.Open.buffer(await zipOf(many));

    await expect(extractArchiveSafely(directory, dest, LIMITS)).rejects.toThrow(/too many files/);
    await expect(fs.access(dest)).rejects.toThrow();
  });

  it('stops once the unpacked total passes the limit', async () => {
    const dest = path.join(root, 'unpacked');
    const file = path.join(root, 'big.zip');
    await writeZip(file, [{ name: 'big.bin', data: () => repeatedBytes(4 * MB) }]);
    const directory = await unzipper.Open.file(file);

    await expect(extractArchiveSafely(directory, dest, LIMITS)).rejects.toThrow(/maximum decompressed size/);
    // Stopped part-way: no more than the limit, and a little of a chunk, reached disk.
    expect((await fs.stat(path.join(dest, 'big.bin'))).size).toBeLessThanOrEqual(LIMITS.maxTotalBytes + 64 * 1024);
  });

  it.each([
    ['a parent folder', 'xx/evil.txt', '../evil.txt'],
    ['an absolute path', 'xtmp/evil.txt', '/tmp/evil.txt'],
    ['a backslash', 'xx_evil.txt', '..\\evil.txt'],
  ])('refuses an entry that leaves the folder through %s, writing nothing outside it', async (_label, built, crafted) => {
    const dest = path.join(root, 'unpacked');
    const file = path.join(root, 'slip.zip');
    await writeZip(file, [{ name: 'ok.txt', data: 'fine' }, { name: built, data: 'escaped' }]);
    renameEntry(file, built, crafted);
    const directory = await unzipper.Open.file(file);
    expect(directory.files.map((f) => f.path)).toContain(crafted);

    await expect(extractArchiveSafely(directory, dest, LIMITS)).rejects.toThrow(/Unsafe file path/);
    expect(await filesUnder(root)).toEqual(['slip.zip', path.join('unpacked', 'ok.txt')].sort());
  });

  it('writes a symbolic link entry as an ordinary file, so it cannot be followed out', async () => {
    const dest = path.join(root, 'unpacked');
    const file = path.join(root, 'link.zip');
    const archive = archiver('zip');
    const out = (await import('fs')).createWriteStream(file);
    const closed = new Promise<void>((resolve) => out.on('close', () => resolve()));
    archive.pipe(out);
    archive.symlink('uploads/link', '../../../../etc');
    await archive.finalize();
    await closed;

    await extractArchiveSafely(await unzipper.Open.file(file), dest, LIMITS);

    const written = await fs.lstat(path.join(dest, 'uploads/link'));
    expect(written.isSymbolicLink()).toBe(false);
    expect(written.isFile()).toBe(true);
  });
});

describe('countListedEntries', () => {
  it('reads the count an archive lists from its end', async () => {
    const file = path.join(root, 'three.zip');
    await writeZip(file, [{ name: 'a', data: '1' }, { name: 'b', data: '2' }, { name: 'c', data: '3' }]);
    expect(await countListedEntries(file)).toBe(3);
  });

  it('reads the count from the ZIP64 record when the short one is full', async () => {
    const file = path.join(root, 'zip64.zip');
    writeZip64Claiming(file, 5_000_000_000n);
    expect(await countListedEntries(file)).toBe(5_000_000_000);
  });

  it('says plainly when a file is not an archive', async () => {
    const file = path.join(root, 'not.zip');
    await fs.writeFile(file, 'just some text, not a ZIP at all');
    await expect(countListedEntries(file)).rejects.toThrow('The file is not a ZIP archive, or it is damaged.');
  });
});

describe('openArchiveFile', () => {
  afterEach(() => jest.restoreAllMocks());

  it('refuses an archive listing more entries than allowed before reading its directory', async () => {
    const file = path.join(root, 'many.zip');
    await writeManyEntryZip(file, 11);
    const read = jest.spyOn(unzipper.Open, 'file');

    await expect(openArchiveFile(file, 10)).rejects.toThrow('The archive lists 11 files, more than the 10 it may hold.');
    expect(read).not.toHaveBeenCalled();
  });

  it('opens an archive within the limit', async () => {
    const file = path.join(root, 'few.zip');
    await writeManyEntryZip(file, 10);
    expect((await openArchiveFile(file, 10)).files).toHaveLength(10);
  });
});

describe('reading one entry within limits', () => {
  async function bomb(name: string, claimed?: number): Promise<{ file: string; entry: unzipper.File }> {
    const file = path.join(root, `${name}.zip`);
    await writeZip(file, [{ name, data: () => repeatedBytes(50 * MB) }]);
    if (claimed !== undefined) claimUnpackedSize(file, name, claimed);
    const entry = (await unzipper.Open.file(file)).files[0];
    return { file, entry };
  }

  it('reads an entry within its limit, packed or stored', async () => {
    const file = path.join(root, 'small.zip');
    await writeZip(file, [{ name: 'packed.json', data: '{"a":1}' }, { name: 'stored.json', data: '{"b":2}', store: true }]);
    const [packed, stored] = (await unzipper.Open.file(file)).files;
    const total = new UnpackedTotal(MB);

    expect((await readArchiveEntry(file, packed, { maxEntryBytes: 100, total })).toString()).toBe('{"a":1}');
    expect((await readArchiveEntry(file, stored, { maxEntryBytes: 100, total })).toString()).toBe('{"b":2}');
    expect(total.bytes).toBe(14);
  });

  it('refuses an entry whose directory size is over its limit without unpacking it', async () => {
    const { file, entry } = await bomb('big.json');
    const total = new UnpackedTotal(100 * MB);
    const err = await readArchiveEntry(file, entry, { maxEntryBytes: MB, total }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ArchiveLimitError);
    expect((err as ArchiveLimitError).limit).toBe('entry');
    expect(total.bytes).toBe(0);
  });

  it('stops an entry that claims to be small once it unpacks past its limit', async () => {
    const { file, entry } = await bomb('liar.json', 10);
    const total = new UnpackedTotal(100 * MB);
    const err = await readArchiveEntry(file, entry, { maxEntryBytes: MB, total }).catch((e: unknown) => e);
    expect((err as ArchiveLimitError).limit).toBe('entry');
    expect(total.bytes).toBeLessThanOrEqual(MB + 64 * 1024);
  });

  it('stops once the archive total passes its limit, whatever the entry allows', async () => {
    const { file, entry } = await bomb('liar.bin', 10);
    const total = new UnpackedTotal(2 * MB);
    const err = await readArchiveEntry(file, entry, { maxEntryBytes: 100 * MB, total }).catch((e: unknown) => e);
    expect((err as ArchiveLimitError).limit).toBe('total');
  });

  it('removes the part-written file when an entry is stopped', async () => {
    const { file, entry } = await bomb('liar.png', 10);
    const dest = path.join(root, 'out.png');
    await expect(writeArchiveEntry(file, entry, dest, { maxEntryBytes: MB, total: new UnpackedTotal(100 * MB) })).rejects.toThrow(ArchiveLimitError);
    await expect(fs.access(dest)).rejects.toThrow();
  });

  it('writes an entry within its limit and reports its size', async () => {
    const file = path.join(root, 'pic.zip');
    await writeZip(file, [{ name: 'pic.png', data: Buffer.alloc(3000, 7) }]);
    const entry = (await unzipper.Open.file(file)).files[0];
    const dest = path.join(root, 'pic.png');
    expect(await writeArchiveEntry(file, entry, dest, { maxEntryBytes: MB, total: new UnpackedTotal(MB) })).toBe(3000);
    expect(await fs.readFile(dest)).toEqual(Buffer.alloc(3000, 7));
  });

  // unzipper's own entry stream keeps the archive open when it is stopped
  // part-way; a few hundred refused pictures would use up the process's files.
  (process.platform === 'linux' ? it : it.skip)('closes the archive file when it stops an entry', async () => {
    const file = path.join(root, 'stored.zip');
    await writeZip(file, [{ name: 'big.bin', data: () => repeatedBytes(30 * MB, 1), store: true }]);
    const entry = (await unzipper.Open.file(file)).files[0];
    const openFiles = () => readdirSync('/proc/self/fd').length;
    const before = openFiles();

    for (let i = 0; i < 10; i++) {
      await readArchiveEntry(file, entry, { maxEntryBytes: MB, total: new UnpackedTotal(100 * MB) }).catch(() => undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(openFiles()).toBeLessThanOrEqual(before);
  });
});
