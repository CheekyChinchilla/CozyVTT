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
import { isOwnershipStatement } from '../utils/pgRestore';

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

  // The script replaces the public schema. On an install whose DATABASE_URL
  // names another, that is not CozyVTT's data: it would drop whatever else
  // the database holds there and load the backup beside the instance's own.
  it('refuses an address that names another schema, and loads nothing', async () => {
    const result = spawnSync('bash', [SCRIPT, backup], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        DATABASE_URL: 'postgresql://cozyvtt:secret@localhost:5432/cozyvtt?connection_limit=5&schema=cozy',
        RESTORE_ASSUME_YES: 'yes',
        TMPDIR: root,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('DATABASE_URL names the database schema "cozy"');
    expect(result.stdout).toContain('Admin Dashboard');
    await expect(fs.access(loaded)).rejects.toThrow();
  });

  // The pattern that dropped ownership lines backtracked on a long line: two
  // crafted 100 KB lines took about ten seconds with mawk.
  it('reads a long crafted line in one pass', async () => {
    const crafted = [`ALTER ${'A '.repeat(50_000)}x`, `ALTER ${'A '.repeat(50_000)}OWNER TO`];
    await fs.writeFile(backup, gzipSync(DUMP.replace('-- PostgreSQL database dump complete', `${crafted.join('\n')}\n-- PostgreSQL database dump complete`)));

    const started = Date.now();
    const result = run();

    expect(result.status).toBe(0);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  // The script and the dashboard's restore each drop the same lines.
  it('drops exactly the ownership lines the dashboard restore drops', async () => {
    const lines = [
      'ALTER TABLE public."Note" OWNER TO "cozyvttAdmin";',
      'ALTER SEQUENCE public.note_seq OWNER TO cozy;',
      'ALTER FUNCTION public.f() OWNER TO cozy;',
      'ALTER TABLE ONLY public."Note" ADD CONSTRAINT "Note_pkey" PRIMARY KEY (id);',
      'ALTER TABLE public.t OWNER TO ;',
      'ALTER TABLE  OWNER TO x OWNER TO y;',
      'ALTER table public.t OWNER TO y;',
      'ALTER TABLE public.t OWNER TO y',
      'ALTER TABLE OWNER TO y;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE x IN SCHEMA public OWNER TO y;',
    ];
    await fs.writeFile(backup, gzipSync(DUMP.replace('-- PostgreSQL database dump complete', `${lines.join('\n')}\n-- PostgreSQL database dump complete`)));

    expect(run().status).toBe(0);

    const kept = (await fs.readFile(loaded, 'utf8')).split('\n');
    for (const line of lines) {
      expect([line, kept.includes(line)]).toEqual([line, !isOwnershipStatement(line)]);
    }
  });

  // On a Docker install the last thing the script prints is how to check the
  // app. A tunnel setup writes HTTP_PORT=127.0.0.1:80, which "where PORT is
  // HTTP_PORT" read oddly beside; the message names the address to use.
  it('tells a Docker install which address to check, whatever HTTP_PORT holds', async () => {
    // A stand-in docker: the database service is running, and psql inside it reads the dump.
    await fs.writeFile(
      path.join(bin, 'docker'),
      `#!/bin/sh\ncase "$2" in\n  ps) echo database ;;\n  exec) cat > "${loaded}" ;;\nesac\n`,
      { mode: 0o755 }
    );

    const result = spawnSync('bash', [SCRIPT, backup], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: `${bin}:${process.env.PATH ?? ''}`, RESTORE_ASSUME_YES: 'yes', TMPDIR: root },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('curl http://localhost/health');
    expect(result.stdout).toContain('HTTP_PORT=127.0.0.1:8080');
    expect(result.stdout).not.toMatch(/where PORT is/);
  });
});
