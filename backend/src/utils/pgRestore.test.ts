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
  buildRestoreArgs,
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
    'CREATE TABLE public."Note" (id text NOT NULL, body text);',
    'SET default_table_access_method = heap;',
    'COPY public."Note" (id, body) FROM stdin;',
    'a1\tSET transaction_timeout = 0;',
    'SET transaction_timeout = 0;\tbody that starts like the setting',
    '\\.',
    '',
    '\\unrestrict k3y',
  ];

  it('replaces the schema first, drops the setting the server does not know, and keeps the rest byte for byte', async () => {
    const src = await write('database.sql', NEWER_CLIENT_DUMP);
    const dest = path.join(dir, 'restore.sql');

    const result = await prepareDumpForRestore(src, dest);

    const expected = [
      ...RESTORE_PREAMBLE,
      ...NEWER_CLIENT_DUMP.filter((l, i) => !(l === 'SET transaction_timeout = 0;' && i < 16)),
    ].join('\n') + '\n';
    expect(await fs.readFile(dest, 'utf8')).toBe(expected);
    expect(result.removed).toEqual(['SET transaction_timeout = 0;']);
  });

  it('stops filtering once the dump reaches its first table, so a data row is never mistaken for a setting', async () => {
    const src = await write('database.sql', NEWER_CLIENT_DUMP);
    const dest = path.join(dir, 'restore.sql');

    await prepareDumpForRestore(src, dest);

    const out = await fs.readFile(dest, 'utf8');
    expect(out).toContain('SET transaction_timeout = 0;\tbody that starts like the setting\n');
    expect(out).toContain('a1\tSET transaction_timeout = 0;\n');
  });

  it('passes a dump from a client that matches the server through with only the preamble added', async () => {
    const same = NEWER_CLIENT_DUMP.filter((l) => l !== 'SET transaction_timeout = 0;');
    const src = await write('database.sql', same);
    const dest = path.join(dir, 'restore.sql');

    const result = await prepareDumpForRestore(src, dest);

    expect(await fs.readFile(dest, 'utf8')).toBe([...RESTORE_PREAMBLE, ...same].join('\n') + '\n');
    expect(result.removed).toEqual([]);
  });

  it('runs the schema replacement inside the same transaction as the dump', () => {
    // The preamble is plain SQL at the top of the file psql loads with
    // --single-transaction, so a dump that fails to apply rolls the drop back.
    expect(RESTORE_PREAMBLE).toEqual(['DROP SCHEMA public CASCADE;', 'CREATE SCHEMA public;']);
    expect(buildRestoreArgs('postgresql://x', '/tmp/restore.sql')).toContain('--single-transaction');
  });
});
