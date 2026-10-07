/**
 * A restore has to be all or nothing.
 *
 * The dump a backup contains drops every table before recreating it, so the two
 * flags asserted here are what stand between a corrupt backup file and an
 * instance with no data in it. They were missing, and a failed restore reported
 * success.
 *
 * What these tests do not do: load a prepared file into a real PostgreSQL.
 * They check the text psql is handed and the arguments it is run with. The
 * suites run where the PostgreSQL client tools need not be installed (the
 * backend image has them; a developer's machine need not), so a test that
 * needed psql would be skipped there and prove nothing. Restoring a real
 * backup end to end is part of the upgrade rehearsal before a release, in
 * docs/DEVELOPMENT.md ("Before a release: rehearse the upgrade").
 */

import nodeFs, { type ReadStream, type WriteStream } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable, Writable } from 'stream';
import { itWhereModesApply } from '../__tests__/helpers/fileModes';
import {
  buildDumpArgs,
  buildRestoreArgs,
  pgConnection,
  isOwnershipStatement,
  isPrivilegeStatement,
  isSettingUnknownToServer,
  prepareDumpForRestore,
  RESTORE_PREAMBLE,
  RESTORE_TRAILER,
} from './pgRestore';

describe('buildRestoreArgs', () => {
  const args = buildRestoreArgs('postgresql://u:p@h:5432/db', '/tmp/backup/database.sql');

  it('names the database, without its password, and the file to restore', () => {
    expect(args).toEqual(
      expect.arrayContaining(['--dbname', 'postgresql://u@h:5432/db', '--file', '/tmp/backup/database.sql'])
    );
  });

  it('stops at the first failing statement', () => {
    // Without this psql runs the rest of the dump after an error and still
    // exits 0, so the caller cannot tell a failed restore from a good one.
    const i = args.indexOf('-v');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('ON_ERROR_STOP=1');
  });

  it('runs the whole restore in one transaction', () => {
    // So a failure rolls the drops back instead of leaving the tables gone.
    expect(args).toContain('--single-transaction');
  });
});

/**
 * The password never goes on the command line. A process's arguments are
 * visible to every local user in the host's process list (unless /proc is
 * mounted with hidepid), so `--dbname postgresql://user:PASSWORD@host/db`
 * showed the database password to anyone on the machine for as long as a
 * backup or restore ran. libpq reads PGPASSWORD from the environment
 * instead, which only the same user or root can see.
 */
describe('pgConnection', () => {
  it('takes the password out of the address and passes it through the environment', () => {
    const { dbname, env } = pgConnection('postgresql://cozyvtt:s3cret@database:5432/cozyvtt');
    expect(dbname).toBe('postgresql://cozyvtt@database:5432/cozyvtt');
    expect(env.PGPASSWORD).toBe('s3cret');
  });

  it('gives libpq the password as typed, not as the address encodes it', () => {
    const { dbname, env } = pgConnection('postgresql://cozyvtt:p%40ss%2Fw%3Frd@database:5432/cozyvtt');
    expect(env.PGPASSWORD).toBe('p@ss/w?rd');
    expect(dbname).not.toContain('p%40ss');
  });

  it('keeps the query string, which may carry connection options', () => {
    const { dbname } = pgConnection('postgresql://u:p@h:5432/db?sslmode=require');
    expect(dbname).toBe('postgresql://u@h:5432/db?sslmode=require');
  });

  it('leaves an address without a password alone, and sets no password', () => {
    const { dbname, env } = pgConnection('postgresql://u@h:5432/db');
    expect(dbname).toBe('postgresql://u@h:5432/db');
    expect(env).not.toHaveProperty('PGPASSWORD');
  });

  it('passes on what it cannot parse, so an unusual address still connects', () => {
    const { dbname, env } = pgConnection('not a url');
    expect(dbname).toBe('not a url');
    expect(env).not.toHaveProperty('PGPASSWORD');
  });

  it('hands the tools a minimal environment: the path, the password and nothing of the app\'s secrets', () => {
    const { env } = pgConnection('postgresql://u:p@h:5432/db');
    expect(Object.keys(env).sort()).toEqual(['PATH', 'PGPASSWORD']);
  });
});

describe('buildDumpArgs and buildRestoreArgs', () => {
  it.each([
    ['buildDumpArgs', buildDumpArgs],
    ['buildRestoreArgs', buildRestoreArgs],
  ])('%s puts no password on the command line', (_name, build) => {
    const args = build('postgresql://cozyvtt:s3cret@database:5432/cozyvtt', '/tmp/db.sql');
    expect(args.join(' ')).not.toContain('s3cret');
    expect(args).toContain('postgresql://cozyvtt@database:5432/cozyvtt');
  });
});

describe('buildDumpArgs', () => {
  it('writes a dump that drops before it creates and names no owner or privilege', () => {
    const args = buildDumpArgs('postgresql://x', '/tmp/db.sql');
    expect(args).toEqual(expect.arrayContaining(['--clean', '--if-exists', '--no-owner', '--no-privileges']));
    expect(args.slice(0, 4)).toEqual(['--dbname', 'postgresql://x', '--file', '/tmp/db.sql']);
  });

  it('leaves the login sessions out, so a restore cannot bring back a sign-in that was ended since', () => {
    expect(buildDumpArgs('postgresql://x', '/tmp/db.sql')).toContain('--exclude-table-data=public.session');
  });
});

describe('isOwnershipStatement', () => {
  it('names the OWNER TO lines pg_dump writes for every kind of object', () => {
    for (const line of [
      'ALTER TYPE public."AssetScope" OWNER TO "cozyvttAdmin";',
      'ALTER TABLE public."User" OWNER TO cozyvtt;',
      'ALTER SEQUENCE public."Note_id_seq" OWNER TO cozyvtt;',
      'ALTER SCHEMA public OWNER TO cozyvtt;',
      'ALTER FUNCTION public.f() OWNER TO cozyvtt;',
      'ALTER FUNCTION public.f(a integer, b text) OWNER TO "old user";',
      'ALTER MATERIALIZED VIEW public.v OWNER TO cozyvtt;',
      'ALTER TEXT SEARCH CONFIGURATION public.c OWNER TO cozyvtt;',
      'ALTER LARGE OBJECT 16401 OWNER TO cozyvtt;',
    ]) {
      expect(isOwnershipStatement(line)).toBe(true);
    }
  });

  // Every line of an uploaded backup outside table data is checked, and a
  // crafted file can hold a line of any length.
  it.each([
    ['100,000 characters of upper-case words', 'ALTER A' + ' A'.repeat(50_000) + 'x'],
    ['100,000 characters repeating OWNER TO with no closing semicolon', 'ALTER TABLE x' + ' OWNER TO x'.repeat(9_000) + '!'],
    ['100,000 characters repeating OWNER TO, then a carriage return', 'ALTER TABLE x' + ' OWNER TO x'.repeat(9_000) + '\r;'],
    // The old pattern took hours on this shape at 100,000 characters.
    ['10,000 characters of OWNER TO as the kind of object', 'ALTER A' + ' OWNER TO'.repeat(1_100) + 'x'],
  ])('answers %s within 50 ms', (_label, crafted) => {
    const started = performance.now();
    expect(isOwnershipStatement(crafted)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('leaves the other ALTER statements a dump needs', () => {
    for (const line of [
      'ALTER TABLE ONLY public."User" ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);',
      'ALTER TABLE ONLY public."Note" ALTER COLUMN id SET DEFAULT nextval(\'public."Note_id_seq"\'::regclass);',
      'ALTER TABLE ONLY public."Map" ADD CONSTRAINT "Map_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."Campaign"(id);',
      '-- ALTER TABLE public."User" OWNER TO cozyvtt;',
    ]) {
      expect(isOwnershipStatement(line)).toBe(false);
    }
  });
});

describe('isPrivilegeStatement', () => {
  it('names GRANT and REVOKE and nothing else', () => {
    expect(isPrivilegeStatement('GRANT ALL ON SCHEMA public TO PUBLIC;')).toBe(true);
    expect(isPrivilegeStatement('REVOKE ALL ON SCHEMA public FROM PUBLIC;')).toBe(true);
    expect(isPrivilegeStatement('-- GRANT ALL ON SCHEMA public TO PUBLIC;')).toBe(false);
    expect(isPrivilegeStatement("SELECT pg_catalog.set_config('search_path', '', false);")).toBe(false);
  });
});

describe('isSettingUnknownToServer', () => {
  it('names the transaction_timeout line that pg_dump 17 and later write', () => {
    expect(isSettingUnknownToServer('SET transaction_timeout = 0;')).toBe(true);
  });

  it('leaves every other setting alone', () => {
    for (const line of [
      'SET statement_timeout = 0;',
      'SET lock_timeout = 0;',
      'SET idle_in_transaction_session_timeout = 0;',
      "SET client_encoding = 'UTF8';",
      'SET row_security = off;',
      'SET default_table_access_method = heap;',
    ]) {
      expect(isSettingUnknownToServer(line)).toBe(false);
    }
  });

  it('matches a statement only, never a comment or data that mentions the setting', () => {
    expect(isSettingUnknownToServer('-- SET transaction_timeout = 0;')).toBe(false);
    expect(isSettingUnknownToServer('42\tSET transaction_timeout = 0;\t0')).toBe(false);
  });
});

describe('prepareDumpForRestore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-restore-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const write = async (name: string, lines: string[]) => {
    const file = path.join(dir, name);
    await fs.writeFile(file, lines.join('\n') + '\n');
    return file;
  };

  /** The line the restore opens with: psql's restricted mode, under a key the backup cannot know. */
  const RESTRICT_LINE = /^\\restrict [A-Za-z0-9]{32,}$/;

  const NEWER_CLIENT_DUMP = [
    '--',
    '-- PostgreSQL database dump',
    '--',
    '',
    '\\restrict k3y',
    '',
    '-- Dumped from database version 15.19',
    '-- Dumped by pg_dump version 18.6',
    '',
    'SET statement_timeout = 0;',
    'SET lock_timeout = 0;',
    'SET idle_in_transaction_session_timeout = 0;',
    'SET transaction_timeout = 0;',
    "SET client_encoding = 'UTF8';",
    'SET row_security = off;',
    '',
    'DROP TABLE IF EXISTS public."Note";',
    "CREATE TYPE public.\"Mood\" AS ENUM ('calm', 'tense');",
    'ALTER TYPE public."Mood" OWNER TO "cozyvttAdmin";',
    'CREATE TABLE public."Note" (id text NOT NULL, body text);',
    'ALTER TABLE public."Note" OWNER TO "cozyvttAdmin";',
    'ALTER SEQUENCE public."Note_id_seq" OWNER TO "cozyvttAdmin";',
    'GRANT ALL ON SCHEMA public TO PUBLIC;',
    'SET default_table_access_method = heap;',
    'COPY public."Note" (id, body) FROM stdin;',
    'a1\tSET transaction_timeout = 0;',
    'SET transaction_timeout = 0;\tbody that starts like the setting',
    'ALTER TABLE public."Note" OWNER TO "cozyvttAdmin";\tbody that starts like an ownership statement',
    'GRANT ALL ON SCHEMA public TO PUBLIC;\tbody that starts like a grant',
    '\\.',
    '',
    'ALTER TABLE ONLY public."Note" ADD CONSTRAINT "Note_pkey" PRIMARY KEY (id);',
    'CREATE TABLE public."User" (',
    '    id text NOT NULL',
    ');',
    'CREATE TABLE public._prisma_migrations (',
    '    id character varying(36) NOT NULL',
    ');',
    '',
    '--',
    '-- PostgreSQL database dump complete',
    '--',
    '',
    '\\unrestrict k3y',
  ];

  const isSkipped = (l: string) =>
    l === 'SET transaction_timeout = 0;' ||
    (l.startsWith('ALTER ') && l.includes(' OWNER TO ')) ||
    l.startsWith('GRANT ') ||
    /^\\(?:un)?restrict /.test(l);
  /** The sample without the lines a restore drops or replaces, COPY rows untouched. */
  const expectedBody = (dump: string[]) => {
    let inCopy = false;
    return dump.filter((l) => {
      if (inCopy) {
        if (l === '\\.') inCopy = false;
        return true;
      }
      if (/^COPY .* FROM stdin;$/.test(l)) inCopy = true;
      return !isSkipped(l);
    });
  };

  it('replaces the schema first, drops what the server would reject, and keeps the rest byte for byte', async () => {
    const src = await write('database.sql', NEWER_CLIENT_DUMP);
    const dest = path.join(dir, 'restore.sql');

    const result = await prepareDumpForRestore(src, dest);

    const [restrict, ...rest] = (await fs.readFile(dest, 'utf8')).split('\n');
    expect(restrict).toMatch(RESTRICT_LINE);
    expect(rest.join('\n')).toBe([...RESTORE_PREAMBLE, ...expectedBody(NEWER_CLIENT_DUMP), ...RESTORE_TRAILER].join('\n') + '\n');
    expect(result.skipped).toEqual({ settings: ['SET transaction_timeout = 0;'], ownership: 3, privileges: 1 });
    expect(result.refused).toBeNull();
  });

  it('drops every owner and privilege statement, so the backup restores under whatever database user the instance has', async () => {
    const src = await write('database.sql', NEWER_CLIENT_DUMP);
    const dest = path.join(dir, 'restore.sql');

    await prepareDumpForRestore(src, dest);

    const out = await fs.readFile(dest, 'utf8');
    // A statement ends in a semicolon; the COPY row that starts like one does not, and stays.
    expect(out).not.toMatch(/^ALTER .* OWNER TO .*;$/m);
    expect(out).not.toMatch(/^GRANT .*;$/m);
    expect(out).toContain('ALTER TABLE ONLY public."Note" ADD CONSTRAINT "Note_pkey" PRIMARY KEY (id);\n');
    expect(out).toContain('CREATE TYPE public."Mood" AS ENUM');
  });

  it('never touches the rows of a COPY block, whatever they start with', async () => {
    const src = await write('database.sql', NEWER_CLIENT_DUMP);
    const dest = path.join(dir, 'restore.sql');

    await prepareDumpForRestore(src, dest);

    const out = await fs.readFile(dest, 'utf8');
    expect(out).toContain('a1\tSET transaction_timeout = 0;\n');
    expect(out).toContain('SET transaction_timeout = 0;\tbody that starts like the setting\n');
    expect(out).toContain('ALTER TABLE public."Note" OWNER TO "cozyvttAdmin";\tbody that starts like an ownership statement\n');
    expect(out).toContain('GRANT ALL ON SCHEMA public TO PUBLIC;\tbody that starts like a grant\n');
  });

  it('passes a dump written the way backups are now written through with only the preamble added', async () => {
    const clean = expectedBody(NEWER_CLIENT_DUMP);
    const src = await write('database.sql', clean);
    const dest = path.join(dir, 'restore.sql');

    const result = await prepareDumpForRestore(src, dest);

    const [restrict, ...rest] = (await fs.readFile(dest, 'utf8')).split('\n');
    expect(restrict).toMatch(RESTRICT_LINE);
    expect(rest.join('\n')).toBe([...RESTORE_PREAMBLE, ...clean, ...RESTORE_TRAILER].join('\n') + '\n');
    expect(result.skipped).toEqual({ settings: [], ownership: 0, privileges: 0 });
    expect(result.refused).toBeNull();
  });

  itWhereModesApply('writes the file psql loads readable by its owner alone, since it is the whole database', async () => {
    const src = await write('database.sql', NEWER_CLIENT_DUMP);
    const dest = path.join(dir, 'restore.sql');

    await prepareDumpForRestore(src, dest);

    expect((await fs.stat(dest)).mode & 0o077).toBe(0);
  });

  describe('what psql is allowed to run', () => {
    it('opens with a restricted-mode line under a new key each time, so psql runs no command the backup holds', async () => {
      const src = await write('database.sql', NEWER_CLIENT_DUMP);
      const first = path.join(dir, 'first.sql');
      const second = path.join(dir, 'second.sql');

      await prepareDumpForRestore(src, first);
      await prepareDumpForRestore(src, second);

      const a = (await fs.readFile(first, 'utf8')).split('\n')[0];
      const b = (await fs.readFile(second, 'utf8')).split('\n')[0];
      expect(a).toMatch(RESTRICT_LINE);
      expect(b).toMatch(RESTRICT_LINE);
      expect(a).not.toBe(b);
    });

    it("drops the backup's own restricted-mode lines, which would otherwise end the restore's", async () => {
      const src = await write('database.sql', NEWER_CLIENT_DUMP);
      const dest = path.join(dir, 'restore.sql');

      await prepareDumpForRestore(src, dest);

      const out = await fs.readFile(dest, 'utf8');
      expect(out).not.toContain('k3y');
      expect(out.match(/^\\/gm)?.length).toBe(2); // the restore's own \restrict, and the COPY block's \.
    });

    it.each([
      ['a shell command', '\\! id > /tmp/pwned'],
      ['output sent to a program', '\\o | sh'],
      ['a setting that turns the error stop off', '\\set ON_ERROR_STOP off'],
      ['a new connection', '\\connect other'],
      ['a client-side copy', "\\copy public.\"Note\" to '/tmp/out'"],
    ])('refuses a backup that holds %s', async (_what, line) => {
      const dump = [...NEWER_CLIENT_DUMP];
      dump.splice(dump.indexOf('SET statement_timeout = 0;'), 0, line);
      const src = await write('database.sql', dump);

      const { refused } = await prepareDumpForRestore(src, path.join(dir, 'restore.sql'));

      expect(refused).toMatch(/psql command/);
      expect(refused).toContain(line);
    });

    it.each(['COMMIT;', 'commit;', 'BEGIN;', 'END;', 'ROLLBACK;', 'START TRANSACTION;'])(
      'refuses a backup that takes control of the transaction with %s',
      async (line) => {
        const dump = [...NEWER_CLIENT_DUMP];
        dump.splice(dump.indexOf('SET default_table_access_method = heap;'), 0, line);
        const src = await write('database.sql', dump);

        const { refused } = await prepareDumpForRestore(src, path.join(dir, 'restore.sql'));

        expect(refused).toMatch(/transaction/);
        expect(refused).toContain(line);
      }
    );

    it('refuses a COPY that is not table data, which could run a program in the database container', async () => {
      const dump = [...NEWER_CLIENT_DUMP];
      dump.splice(dump.indexOf('SET default_table_access_method = heap;'), 0, "COPY public.\"Note\" TO PROGRAM 'sh /tmp/x';");
      const src = await write('database.sql', dump);

      const { refused } = await prepareDumpForRestore(src, path.join(dir, 'restore.sql'));

      expect(refused).toMatch(/COPY that is not table data/);
    });

    it('lets a table row start with a backslash, which is how a row whose first column is empty is written', async () => {
      const dump = [...NEWER_CLIENT_DUMP];
      dump.splice(dump.indexOf('\\.'), 0, '\\N\tnote with no id');
      const src = await write('database.sql', dump);
      const dest = path.join(dir, 'restore.sql');

      const { refused } = await prepareDumpForRestore(src, dest);

      expect(refused).toBeNull();
      expect(await fs.readFile(dest, 'utf8')).toContain('\n\\N\tnote with no id\n');
    });
  });

  describe('a backup that is not complete', () => {
    it('refuses an empty file', async () => {
      const src = await write('database.sql', []);

      const { refused } = await prepareDumpForRestore(src, path.join(dir, 'restore.sql'));

      expect(refused).toMatch(/cut short/);
    });

    it('refuses a dump cut short after its data, before the constraints and indexes pg_dump writes last', async () => {
      const cut = NEWER_CLIENT_DUMP.slice(0, NEWER_CLIENT_DUMP.indexOf('\\.') + 1);
      const src = await write('database.sql', cut);

      const { refused } = await prepareDumpForRestore(src, path.join(dir, 'restore.sql'));

      expect(refused).toMatch(/cut short/);
    });

    it('refuses a dump cut short in the middle of a table', async () => {
      const cut = NEWER_CLIENT_DUMP.slice(0, NEWER_CLIENT_DUMP.indexOf('\\.'));
      const src = await write('database.sql', cut);

      const { refused } = await prepareDumpForRestore(src, path.join(dir, 'restore.sql'));

      expect(refused).toMatch(/partway through/);
    });

    it("does not count the trailer when it only appears inside a table's rows", async () => {
      const dump = NEWER_CLIENT_DUMP.slice(0, NEWER_CLIENT_DUMP.indexOf('\\.'));
      dump.push('-- PostgreSQL database dump complete');
      const src = await write('database.sql', dump);

      const { refused } = await prepareDumpForRestore(src, path.join(dir, 'restore.sql'));

      expect(refused).toMatch(/partway through/);
    });

    it('refuses a complete dump of some other database', async () => {
      const other = NEWER_CLIENT_DUMP.filter((l) => !l.startsWith('CREATE TABLE public."User"'));
      const src = await write('database.sql', other);

      const { refused } = await prepareDumpForRestore(src, path.join(dir, 'restore.sql'));

      expect(refused).toMatch(/not a CozyVTT backup/);
      expect(refused).toContain('User');
    });

    it('accepts a real dump taken on Windows line endings', async () => {
      const src = path.join(dir, 'database.sql');
      await fs.writeFile(src, NEWER_CLIENT_DUMP.join('\r\n') + '\r\n');
      const dest = path.join(dir, 'restore.sql');

      const { refused } = await prepareDumpForRestore(src, dest);

      expect(refused).toBeNull();
      const out = await fs.readFile(dest, 'utf8');
      expect(out).not.toContain('k3y');
      expect(out).toContain('CREATE TABLE public."User" (\r\n');
    });
  });

  it('writes every byte it keeps exactly as it read it, whatever the encoding', async () => {
    // A database in LATIN1 dumps its rows in LATIN1, where 0xFF is a letter;
    // a string literal may hold a carriage return of its own.
    const body = Buffer.concat([
      Buffer.from(expectedBody(NEWER_CLIENT_DUMP).slice(0, 8).join('\n') + '\n'),
      Buffer.from("COMMENT ON TABLE public.\"Note\" IS 'one\rtwo';\n"),
      Buffer.from('COPY public."Note" (id, body) FROM stdin;\n'),
      Buffer.from([0x62, 0x31, 0x09, 0x63, 0x61, 0x66, 0xe9, 0x20, 0xff, 0x0a]),
      Buffer.from('\\.\n'),
      Buffer.from(expectedBody(NEWER_CLIENT_DUMP).slice(expectedBody(NEWER_CLIENT_DUMP).indexOf('\\.') + 1).join('\n') + '\n'),
    ]);
    const src = path.join(dir, 'database.sql');
    await fs.writeFile(src, body);
    const dest = path.join(dir, 'restore.sql');

    const { refused } = await prepareDumpForRestore(src, dest);

    expect(refused).toBeNull();
    const out = await fs.readFile(dest);
    const trailer = Buffer.from(RESTORE_TRAILER.join('\n') + '\n');
    const afterPreamble = out.subarray(out.indexOf(RESTORE_PREAMBLE[1]) + RESTORE_PREAMBLE[1].length + 1, out.length - trailer.length);
    expect(afterPreamble.equals(body)).toBe(true);
    expect(out.subarray(out.length - trailer.length).equals(trailer)).toBe(true);
  });

  it('rejects, instead of exiting the process, when a write fails while it waits for the dump', async () => {
    // A full disk fails a write after the call has returned, as an 'error'
    // event. Nothing listened for one while the loop waited on the next part
    // of the dump, and a stream error nobody hears exits the backend in the
    // middle of a restore, leaving the unpacked database in the temp folder.
    const src = await write('database.sql', NEWER_CLIENT_DUMP);
    const text = await fs.readFile(src, 'latin1');
    const slowly = jest.spyOn(nodeFs, 'createReadStream').mockImplementation(() => Readable.from((async function* () {
      await new Promise((resolve) => setTimeout(resolve, 200));
      yield text;
    })()) as unknown as ReadStream);
    const full = jest.spyOn(nodeFs, 'createWriteStream').mockImplementation(() => new Writable({
      write(_chunk, _encoding, callback) {
        setImmediate(() => callback(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })));
      },
    }) as unknown as WriteStream);
    try {
      await expect(prepareDumpForRestore(src, path.join(dir, 'restore.sql'))).rejects.toThrow(/ENOSPC/);
    } finally {
      slowly.mockRestore();
      full.mockRestore();
    }
  });

  // Some filesystems (NFS over its quota) report a failed write only when the
  // file is closed, which comes after every write has returned. That error
  // arrived once the file had been called fine, and psql loaded it.
  it('rejects when the file cannot be closed', async () => {
    const src = await write('database.sql', NEWER_CLIENT_DUMP);
    const closeFails = jest.spyOn(nodeFs, 'createWriteStream').mockImplementation(() => new Writable({
      write(_chunk, _encoding, callback) { callback(); },
      destroy(_error, callback) { callback(Object.assign(new Error('EDQUOT: disk quota exceeded, close'), { code: 'EDQUOT' })); },
    }) as unknown as WriteStream);
    try {
      await expect(prepareDumpForRestore(src, path.join(dir, 'restore.sql'))).rejects.toThrow(/EDQUOT/);
    } finally {
      closeFails.mockRestore();
    }
  });

  it('ends by emptying the login sessions an older backup carried, inside the same transaction', () => {
    // Every backup made before sessions were left out holds the session
    // table's rows, and a restore would revive each one that had not yet
    // expired, sign-ins ended since included. The table may be missing from
    // a very old backup, so the purge checks for it first.
    expect(RESTORE_TRAILER.join('\n')).toMatch(/to_regclass\('public\.session'\)/);
    expect(RESTORE_TRAILER.join('\n')).toMatch(/DELETE FROM public\.session/);
  });

  it('runs the schema replacement inside the same transaction as the dump', () => {
    // The preamble is plain SQL at the top of the file psql loads with
    // --single-transaction, so a dump that fails to apply rolls the drop back.
    expect(RESTORE_PREAMBLE).toEqual(['DROP SCHEMA public CASCADE;', 'CREATE SCHEMA public;']);
    expect(buildRestoreArgs('postgresql://x', '/tmp/restore.sql')).toContain('--single-transaction');
  });
});
