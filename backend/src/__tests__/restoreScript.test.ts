/**
 * backend/scripts/restore.sh, run against a stand-in psql.
 *
 * The script unpacks the backup into a working file before anything is
 * loaded, and trusted awk's exit status to say that file was written whole.
 * busybox awk, the awk on Alpine, exits 0 when its writes fail, so on a full
 * temporary folder a cut-short file went on to psql, which commits whatever
 * tables were written before the disk filled.
 */
import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { gzipSync } from 'zlib';

const SCRIPT = path.resolve(__dirname, '../../scripts/restore.sh');

const describeOnPosix = process.platform === 'win32' ? describe.skip : describe;

/** The shortest dump the script accepts as a CozyVTT backup. */
const DUMP = [
  '-- PostgreSQL database dump',
  'CREATE TABLE public."User" (',
  '    id text NOT NULL',
  ');',
  'CREATE TABLE public._prisma_migrations (',
  '    id character varying(36) NOT NULL',
  ');',
  'COPY public."User" (id) FROM stdin;',
  'u1',
  '\\.',
  '-- PostgreSQL database dump complete',
].join('\n') + '\n';

describeOnPosix('restore.sh', () => {
  let root: string;
  let bin: string;
  let backup: string;
  let loaded: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-restore-script-'));
    bin = path.join(root, 'bin');
    await fs.mkdir(bin);
    backup = path.join(root, 'cozyvtt_20260927_120000.sql.gz');
    await fs.writeFile(backup, gzipSync(DUMP));
    // Keeps what it was asked to load, so a test can see whether it ran.
    loaded = path.join(root, 'loaded.sql');
    await fs.writeFile(path.join(bin, 'psql'), `#!/bin/sh\ncat > "${loaded}"\n`, { mode: 0o755 });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const run = () =>
    spawnSync('bash', [SCRIPT, backup], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        DATABASE_URL: 'postgresql://cozyvtt:secret@localhost:5432/cozyvtt',
        RESTORE_ASSUME_YES: 'yes',
        TMPDIR: root,
      },
    });

  it('loads a backup it could write out whole, ending with the session purge', async () => {
    const result = run();

    expect(result.status).toBe(0);
    const text = await fs.readFile(loaded, 'utf8');
    expect(text).toMatch(/^u1$/m);
    expect(text.trimEnd().split('\n').pop()).toMatch(/DELETE FROM public\.session/);
  });

  it('loads nothing when the working file comes out cut short, even if awk says it succeeded', async () => {
    // busybox awk on a full disk: the first lines land, the rest are lost,
    // and it exits 0.
    await fs.writeFile(path.join(bin, 'awk'), '#!/bin/sh\ncat > /dev/null\necho "SET client_min_messages = warning;"\nexit 0\n', { mode: 0o755 });

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/Could not write the unpacked backup/);
    await expect(fs.access(loaded)).rejects.toThrow();
  });

  it('decodes a percent-encoded password, and uses port 5432 when the address names none', async () => {
    const seen = path.join(root, 'seen.txt');
    await fs.writeFile(path.join(bin, 'psql'), `#!/bin/sh\nprintf '%s\\n' "$PGPASSWORD" "$@" > "${seen}"\ncat > /dev/null\n`, { mode: 0o755 });

    const result = spawnSync('bash', [SCRIPT, backup], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        DATABASE_URL: 'postgresql://cozy%2Badmin:p%40ss%25w0rd@db.internal/cozyvtt?schema=public',
        RESTORE_ASSUME_YES: 'yes',
        TMPDIR: root,
      },
    });

    expect(result.status).toBe(0);
    const [password, ...args] = (await fs.readFile(seen, 'utf8')).trimEnd().split('\n');
    expect(password).toBe('p@ss%w0rd');
    expect(args).toEqual(expect.arrayContaining(['-h', 'db.internal', '-p', '5432', '-U', 'cozy+admin', '-d', 'cozyvtt']));
  });
});
