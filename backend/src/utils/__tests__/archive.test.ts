import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { extractArchiveSafely } from '../archive';
import { expectFileMode } from '../../__tests__/helpers/fileModes';

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

// A restore unpacks a whole backup, database dump included, under the
// system's temporary folder, which on a host without Docker every local
// account can read.
describe('extractArchiveSafely', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-archive-')); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('creates the folder it unpacks into readable by its owner alone', async () => {
    const dest = path.join(root, 'unpacked');
    const directory = await unzipper.Open.buffer(await zipOf({ 'database.sql': 'SELECT 1;\n', 'uploads/a/b.txt': 'b' }));

    await extractArchiveSafely(directory, dest, LIMITS);

    await expectFileMode(dest, 0o077, 0);
    expect(await fs.readFile(path.join(dest, 'database.sql'), 'utf8')).toBe('SELECT 1;\n');
    expect(await fs.readFile(path.join(dest, 'uploads/a/b.txt'), 'utf8')).toBe('b');
  });

});
