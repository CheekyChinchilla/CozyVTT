/**
 * backend/scripts/backup.sh, run against a stand-in pg_dump.
 *
 * The script sets umask 077, which covers only what it creates. A backups
 * folder that already existed, and the dumps an earlier version wrote into it
 * readable by every account, kept their modes, and each holds every password
 * hash and MFA secret on the instance.
 */
import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const SCRIPT = path.resolve(__dirname, '../../scripts/backup.sh');

const describeOnPosix = process.platform === 'win32' ? describe.skip : describe;

describeOnPosix('backup.sh', () => {
  let root: string;
  let bin: string;
  let backups: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-backup-script-'));
    bin = path.join(root, 'bin');
    backups = path.join(root, 'backups');
    await fs.mkdir(bin);
    // Writes a dump the way pg_dump does, whatever it is asked.
    await fs.writeFile(path.join(bin, 'pg_dump'), '#!/bin/sh\necho "-- PostgreSQL database dump complete"\n', { mode: 0o755 });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const run = () =>
    spawnSync('bash', [SCRIPT], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        DATABASE_URL: 'postgresql://cozyvtt:secret@localhost:5432/cozyvtt',
        BACKUP_DIR: backups,
      },
    });

  const modeOf = async (p: string) => (await fs.stat(p)).mode & 0o777;

  it('makes a backups folder that already existed, and the dumps already in it, private', async () => {
    await fs.mkdir(backups);
    await fs.chmod(backups, 0o755);
    const older = path.join(backups, 'cozyvtt_20260901_030000.sql.gz');
    await fs.writeFile(older, 'an older dump');
    await fs.chmod(older, 0o644);

    const result = run();

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(await modeOf(backups)).toBe(0o700);
    expect(await modeOf(older)).toBe(0o600);
    const written = (await fs.readdir(backups)).filter((f) => f !== path.basename(older));
    expect(written).toEqual([expect.stringMatching(/^cozyvtt_\d{8}_\d{6}\.sql\.gz$/)]);
    expect(await modeOf(path.join(backups, written[0]))).toBe(0o600);
  });

  it('creates a missing backups folder private', async () => {
    const result = run();

    expect(result.status).toBe(0);
    expect(await modeOf(backups)).toBe(0o700);
  });
});
