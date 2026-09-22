/**
 * The restore route, with the database tools stubbed.
 *
 * psql and the migration run are child processes, so the test replaces
 * child_process.execFile and checks what the route hands them: psql must load
 * the prepared copy of the dump (schema replaced, the setting an older server
 * rejects removed), migrations must run after a successful load and never
 * after a failed one, and a failed load must leave the uploads alone.
 */

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: jest.fn(),
}));

import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import request from 'supertest';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import logger from '../../utils/logger';

const app = createTestApp();
const execFileMock = execFile as unknown as jest.Mock;
const errorSpy = jest.spyOn(logger, 'error');

interface ToolCall {
  cmd: string;
  args: string[];
  /** What psql was given to load, read at the moment of the call (the file is deleted afterwards). */
  sqlLoaded?: string;
}

type Done = (err: Error | null, out?: { stdout: string; stderr: string }) => void;

/** Stand in for psql and the migration run; `fail` makes one of them exit non-zero. */
function stubTools(fail?: { cmd: string; stderr: string }): ToolCall[] {
  const calls: ToolCall[] = [];
  execFileMock.mockImplementation((cmd: string, args: string[], ...rest: unknown[]) => {
    const done = rest[rest.length - 1] as Done;
    const call: ToolCall = { cmd, args };
    const finish = () => {
      calls.push(call);
      if (fail && fail.cmd === cmd) {
        done(Object.assign(new Error(`${cmd} exited with code 3`), { code: 3, stderr: fail.stderr }));
      } else {
        done(null, { stdout: '', stderr: '' });
      }
    };
    const fileFlag = args.indexOf('--file');
    if (cmd === 'psql' && fileFlag >= 0) {
      fs.readFile(args[fileFlag + 1], 'utf8').then((sql) => { call.sqlLoaded = sql; finish(); }, finish);
    } else {
      finish();
    }
  });
  return calls;
}

/** A backup archive holding the given files. */
async function backupZip(entries: Record<string, string>): Promise<Buffer> {
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

/** What pg_dump 18 writes for a PostgreSQL 15 database: the header names a setting 15 rejects. */
const DUMP_FROM_NEWER_CLIENT = [
  '--',
  '-- PostgreSQL database dump',
  '--',
  '',
  '-- Dumped from database version 15.19',
  '-- Dumped by pg_dump version 18.6',
  '',
  'SET statement_timeout = 0;',
  'SET transaction_timeout = 0;',
  "SET client_encoding = 'UTF8';",
  '',
  'DROP TABLE IF EXISTS public."Note";',
  'CREATE TABLE public."Note" (id text NOT NULL, body text);',
  'ALTER TABLE public."Note" OWNER TO "cozyvttAdmin";',
  'COPY public."Note" (id, body) FROM stdin;',
  'a1\tSET transaction_timeout = 0;',
  '\\.',
  '',
].join('\n');

let adminId: string;
let userId: string;
let admin: ReturnType<typeof request.agent>;
let user: ReturnType<typeof request.agent>;

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const stamp = Date.now();
  const a = await createTestUser({ email: `restore-admin-${stamp}@test.cozyvtt.local`, role: PlatformRole.ADMIN });
  const u = await createTestUser({ email: `restore-user-${stamp}@test.cozyvtt.local` });
  adminId = a.id;
  userId = u.id;
  admin = await login(a.email);
  user = await login(u.email);
});

afterAll(async () => {
  await cleanupUsers([adminId, userId]);
});

beforeEach(() => {
  execFileMock.mockReset();
  errorSpy.mockClear();
});

const restore = (agent: ReturnType<typeof request.agent>, zip: Buffer) =>
  agent.post('/api/admin/backups/restore').attach('backup', zip, 'backup.zip');

describe('POST /api/admin/backups/restore', () => {
  it('loads the prepared dump, not the raw one, and then runs the migrations', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

    const res = await restore(admin, zip);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/log in again/);

    expect(calls.map((c) => c.cmd)).toEqual(['psql', 'npx']);
    const [psql, migrate] = calls;
    expect(psql.args).toEqual(expect.arrayContaining(['--single-transaction', 'ON_ERROR_STOP=1']));
    expect(path.basename(psql.args[psql.args.indexOf('--file') + 1])).not.toBe('database.sql');
    expect(psql.sqlLoaded?.startsWith('DROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\n')).toBe(true);
    expect(psql.sqlLoaded).not.toContain('\nSET transaction_timeout = 0;\n');
    expect(psql.sqlLoaded).toContain('CREATE TABLE public."Note"');
    expect(psql.sqlLoaded).not.toContain('OWNER TO');
    expect(psql.sqlLoaded).toContain('a1\tSET transaction_timeout = 0;\n');
    expect(migrate.args).toEqual(['prisma', 'migrate', 'deploy']);
  });

  it('answers 500 when the load fails, runs no migration and copies no uploads', async () => {
    const marker = `restore-test-${Date.now()}`;
    const calls = stubTools({ cmd: 'psql', stderr: 'ERROR:  unrecognized configuration parameter "transaction_timeout"' });
    const zip = await backupZip({
      'database.sql': DUMP_FROM_NEWER_CLIENT,
      [`uploads/${marker}/marker.txt`]: 'must not be copied',
    });

    const res = await restore(admin, zip);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Restore Failed');
    expect(calls.map((c) => c.cmd)).toEqual(['psql']);
    // The log carries psql's own words and never the command line, which holds the database URL and its password.
    const logged = JSON.stringify(errorSpy.mock.calls.filter((c) => String(c[0]).includes('psql restore error')));
    expect(logged).toContain('unrecognized configuration parameter');
    expect(logged).not.toContain('postgresql://');
    await expect(fs.access(path.join(process.env.UPLOAD_DIR || 'uploads', marker))).rejects.toBeDefined();
  });

  it('says the database was restored but not migrated when the migration run fails', async () => {
    const calls = stubTools({ cmd: 'npx', stderr: 'Error: P1001' });
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

    const res = await restore(admin, zip);

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/restart/i);
    expect(calls.map((c) => c.cmd)).toEqual(['psql', 'npx']);
  });

  it('refuses anyone who is not a platform administrator', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

    const res = await restore(user, zip);

    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });
});
