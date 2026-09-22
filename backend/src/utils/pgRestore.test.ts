/**
 * A restore has to be all or nothing.
 *
 * The dump a backup contains drops every table before recreating it, so the two
 * flags asserted here are what stand between a corrupt backup file and an
 * instance with no data in it. They were missing, and a failed restore reported
 * success.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  buildDumpArgs,
  buildRestoreArgs,
  isOwnershipStatement,
  isPrivilegeStatement,
  isSettingUnknownToServer,
  prepareDumpForRestore,
  RESTORE_PREAMBLE,
} from './pgRestore';

describe('buildRestoreArgs', () => {
  const args = buildRestoreArgs('postgresql://u:p@h:5432/db', '/tmp/backup/database.sql');

  it('names the database and the file to restore', () => {
    expect(args).toEqual(
      expect.arrayContaining(['--dbname', 'postgresql://u:p@h:5432/db', '--file', '/tmp/backup/database.sql'])
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

describe('buildDumpArgs', () => {
  it('writes a dump that drops before it creates and names no owner or privilege', () => {
    const args = buildDumpArgs('postgresql://x', '/tmp/db.sql');
    expect(args).toEqual(expect.arrayContaining(['--clean', '--if-exists', '--no-owner', '--no-privileges']));
    expect(args.slice(0, 4)).toEqual(['--dbname', 'postgresql://x', '--file', '/tmp/db.sql']);
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
    ]) {
      expect(isOwnershipStatement(line)).toBe(true);
    }
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
    '',
    '\\unrestrict k3y',
  ];

  const isSkipped = (l: string) =>
    l === 'SET transaction_timeout = 0;' || (l.startsWith('ALTER ') && l.includes(' OWNER TO ')) || l.startsWith('GRANT ');
  /** The sample without the statements a restore drops, COPY rows untouched. */
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

    const expected = [...RESTORE_PREAMBLE, ...expectedBody(NEWER_CLIENT_DUMP)].join('\n') + '\n';
    expect(await fs.readFile(dest, 'utf8')).toBe(expected);
    expect(result.skipped).toEqual({ settings: ['SET transaction_timeout = 0;'], ownership: 3, privileges: 1 });
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

    expect(await fs.readFile(dest, 'utf8')).toBe([...RESTORE_PREAMBLE, ...clean].join('\n') + '\n');
    expect(result.skipped).toEqual({ settings: [], ownership: 0, privileges: 0 });
  });

  it('runs the schema replacement inside the same transaction as the dump', () => {
    // The preamble is plain SQL at the top of the file psql loads with
    // --single-transaction, so a dump that fails to apply rolls the drop back.
    expect(RESTORE_PREAMBLE).toEqual(['DROP SCHEMA public CASCADE;', 'CREATE SCHEMA public;']);
    expect(buildRestoreArgs('postgresql://x', '/tmp/restore.sql')).toContain('--single-transaction');
  });
});
