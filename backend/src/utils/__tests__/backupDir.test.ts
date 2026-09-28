import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { resolveBackupDir, isInside, ensureBackupDir } from '../backupDir';
import logger from '../logger';
import { describeWhereModesApply } from '../../__tests__/helpers/fileModes';

describe('resolveBackupDir', () => {
  it('defaults to a backups directory beside uploads, never inside it', () => {
    const dir = resolveBackupDir({});
    expect(dir).toBe(path.resolve('backups'));
    expect(isInside(dir, path.resolve('uploads'))).toBe(false);
  });

  it('honours BACKUP_DIR', () => {
    expect(resolveBackupDir({ BACKUP_DIR: '/var/lib/cozyvtt/backups' })).toBe('/var/lib/cozyvtt/backups');
  });

  it('refuses a backup directory inside the uploads directory', () => {
    expect(() => resolveBackupDir({ BACKUP_DIR: 'uploads/backups' })).toThrow(/must not be inside/);
    expect(() => resolveBackupDir({ UPLOAD_DIR: '/srv/media', BACKUP_DIR: '/srv/media/nested/deeper' })).toThrow(/must not be inside/);
  });
});

describe('isInside', () => {
  it('is true for the directory itself and anything beneath it', () => {
    expect(isInside('/a/b', '/a')).toBe(true);
    expect(isInside('/a', '/a')).toBe(true);
    expect(isInside('/a/../c', '/a')).toBe(false);
    expect(isInside('/ab', '/a')).toBe(false);
  });
});

// The deployment guide promises the folder is its user's alone, as the
// archives in it are. Only the Docker start script made it so; an install
// without Docker got whatever the process umask gave, usually 755.
describeWhereModesApply('ensureBackupDir', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-backupdir-')); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('creates the folder readable by its owner alone', async () => {
    const dir = path.join(root, 'backups');
    await ensureBackupDir(dir);
    expect((await fs.stat(dir)).mode & 0o777).toBe(0o700);
  });

  // A folder BACKUP_DIR names may be shared on purpose, with an account that
  // copies backups off the machine; closing it up is still right, but not
  // silently, or that copy just stops working.
  it('closes up a folder that already exists, and says it did', async () => {
    const dir = path.join(root, 'backups');
    await fs.mkdir(dir, { mode: 0o755 });
    await fs.chmod(dir, 0o755);
    const warned = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    await ensureBackupDir(dir);
    expect((await fs.stat(dir)).mode & 0o777).toBe(0o700);
    expect(warned).toHaveBeenCalledWith(expect.stringMatching(/private/), expect.objectContaining({ dir, previousMode: '755' }));
    warned.mockRestore();
  });

  // Some mounts (SMB without Unix extensions, vfat with 'quiet') accept a
  // chmod and ignore it. Saying the folder was made private there would say
  // the opposite of what is true, every time the list is opened.
  it('says it could not make the folder private when a chmod is accepted and ignored', async () => {
    const dir = path.join(root, 'backups');
    await fs.mkdir(dir, { mode: 0o755 });
    await fs.chmod(dir, 0o755);
    const ignored = jest.spyOn(fs, 'chmod').mockResolvedValue(undefined);
    const warned = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    try {
      await ensureBackupDir(dir);
      expect(warned).toHaveBeenCalledWith(expect.stringMatching(/Could not make the backups folder private/), expect.objectContaining({ dir }));
      expect(warned).not.toHaveBeenCalledWith(expect.stringMatching(/^Made the backups folder private/), expect.anything());
    } finally {
      warned.mockRestore();
      ignored.mockRestore();
    }
  });

  // A folder its own user cannot open (a mistyped `chmod 600` on the folder
  // itself, say) has no bits for anyone else either. It was left as it was,
  // and every backup vanished from the list.
  it('gives its own user back a folder they cannot open', async () => {
    const dir = path.join(root, 'backups');
    await fs.mkdir(dir, { mode: 0o700 });
    await fs.chmod(dir, 0o600);
    await ensureBackupDir(dir);
    expect((await fs.stat(dir)).mode & 0o777).toBe(0o700);
  });

  it('says nothing about a folder that was already private', async () => {
    const dir = path.join(root, 'backups');
    await fs.mkdir(dir, { mode: 0o700 });
    await fs.chmod(dir, 0o700);
    const warned = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    await ensureBackupDir(dir);
    expect(warned).not.toHaveBeenCalled();
    warned.mockRestore();
  });
});
