import path from 'path';
import { resolveBackupDir, isInside } from '../backupDir';

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
