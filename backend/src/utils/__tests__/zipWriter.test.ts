import { execFileSync } from 'child_process';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import unzipper from 'unzipper';
import { writeZipTo, ZipInputError, type ZipEntrySource } from '../zipWriter';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-zip-writer-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

/** Write an archive of `entries` to a file, returning the file and the bytes the writer counted. */
async function written(entries: ZipEntrySource[]): Promise<{ file: string; bytes: number }> {
  const file = path.join(root, 'out.zip');
  const bytes = await writeZipTo(createWriteStream(file), entries);
  return { file, bytes };
}

describe('writeZipTo', () => {
  it('writes each entry in order, stored or compressed as asked, and counts what it wrote', async () => {
    const picture = path.join(root, 'picture.png');
    await fs.writeFile(picture, Buffer.alloc(200_000, 7));

    const { file, bytes } = await written([
      { name: 'manifest.json', content: '{"a":1}' },
      { name: 'assets/picture.png', file: picture, store: true },
      { name: 'maps/map-0.json', content: 'x'.repeat(10_000) },
    ]);

    expect(bytes).toBe((await fs.stat(file)).size);
    const entries = (await unzipper.Open.file(file)).files;
    expect(entries.map((e) => [e.path, e.compressionMethod, e.uncompressedSize])).toEqual([
      ['manifest.json', 8, 7],
      ['assets/picture.png', 0, 200_000],
      ['maps/map-0.json', 8, 10_000],
    ]);
    expect((await entries[1].buffer()).equals(Buffer.alloc(200_000, 7))).toBe(true);
    expect((await entries[2].buffer()).toString()).toBe('x'.repeat(10_000));
  });

  it('leaves out a file that is gone, or a link in its place, when told it may be', async () => {
    const outside = path.join(root, 'outside.txt');
    await fs.writeFile(outside, 'not to be read');
    await fs.symlink(outside, path.join(root, 'link.png'));

    const { file } = await written([
      { name: 'gone.png', file: path.join(root, 'gone.png'), skipIfGone: true },
      { name: 'link.png', file: path.join(root, 'link.png'), skipIfGone: true },
      { name: 'kept.txt', content: 'kept' },
    ]);

    expect((await unzipper.Open.file(file)).files.map((e) => e.path)).toEqual(['kept.txt']);
  });

  it.each([
    ['is gone', 'gone.sql'],
    ['is a link', 'link.sql'],
  ])('refuses to finish when a file it must hold %s', async (_what, name) => {
    await fs.writeFile(path.join(root, 'outside.sql'), 'not to be read');
    await fs.symlink(path.join(root, 'outside.sql'), path.join(root, 'link.sql'));

    await expect(written([{ name: 'database.sql', file: path.join(root, name) }])).rejects.toBeInstanceOf(ZipInputError);
  });

  // A named pipe put in a file's place would hold the open until something
  // wrote to it: the backup would never end, and it would keep one of the
  // few threads Node reads files with.
  (process.platform === 'win32' ? it.skip : it)('leaves out a named pipe in a file\'s place, never waiting on it', async () => {
    const pipe = path.join(root, 'pipe.png');
    execFileSync('mkfifo', [pipe]);

    const { file } = await written([
      { name: 'pipe.png', file: pipe, skipIfGone: true },
      { name: 'kept.txt', content: 'kept' },
    ]);
    expect((await unzipper.Open.file(file)).files.map((e) => e.path)).toEqual(['kept.txt']);

    await expect(written([{ name: 'database.sql', file: pipe }])).rejects.toBeInstanceOf(ZipInputError);
  });
});
