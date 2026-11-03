/**
 * Whether the Admin Panel's restore would take a backup.
 *
 * Create Backup reported every backup as made, and only the restore refused
 * one past its limits (4 GB, 100,000 files, 10 GiB unpacked), so an admin
 * learned it on the day they needed it. The restore's limits and this check
 * are one module, read from the archive as the restore reads it, and Create
 * Backup warns with its answer.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeZipTo } from '../../utils/zipWriter';
import { restoreRefusalOf, RESTORE_LIMITS } from '../backupLimits';

let dir: string;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-backup-limits-')); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

/** A backup of `files` entries of `bytes` each, plus its database. */
async function backup(name: string, files: number, bytes: number): Promise<{ zip: string; size: number }> {
  const zip = path.join(dir, name);
  const entries = [{ name: 'database.sql', content: 'SELECT 1;' }, ...Array.from({ length: files }, (_, i) => ({ name: `uploads/f${i}.bin`, content: 'x'.repeat(bytes) }))];
  await writeZipTo(fs.createWriteStream(zip), entries);
  return { zip, size: fs.statSync(zip).size };
}

describe('a backup the restore would take', () => {
  it('has no refusal', async () => {
    const { zip, size } = await backup('fine.zip', 3, 10);
    expect(await restoreRefusalOf(zip, size)).toBeNull();
  });
});

describe('a backup past one of the restore\'s limits', () => {
  it('is too large a file', async () => {
    const { zip, size } = await backup('large.zip', 3, 10);
    expect(await restoreRefusalOf(zip, size, { ...RESTORE_LIMITS, maxUploadBytes: size - 1 }))
      .toMatch(/^The Admin Panel's restore would refuse this backup: it is larger than the .* the restore takes\. It is kept: restore it from the command line, as the deployment guide's "To restore anyway" describes\.$/);
  });

  it('holds too many files', async () => {
    const { zip, size } = await backup('many.zip', 5, 1);
    expect(await restoreRefusalOf(zip, size, { ...RESTORE_LIMITS, maxFiles: 4 })).toContain('it holds 6 files, more than the 4 the restore takes.');
  });

  it('unpacks to too much', async () => {
    const { zip, size } = await backup('big.zip', 2, 1000);
    expect(await restoreRefusalOf(zip, size, { ...RESTORE_LIMITS, maxTotalBytes: 1500 })).toContain('it unpacks to more than the');
  });
});

describe('the limits', () => {
  it('are the restore\'s: 4 GB, 100,000 files and 10 GiB unpacked', () => {
    expect(RESTORE_LIMITS).toEqual({ maxUploadBytes: 4 * 1024 ** 3, maxFiles: 100_000, maxTotalBytes: 10 * 1024 ** 3 });
  });
});
