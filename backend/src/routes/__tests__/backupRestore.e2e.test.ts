/**
 * The restore route, with the database tools stubbed.
 *
 * pg_dump, psql and the migration run are child processes, so the test
 * replaces child_process.execFile and checks what the route hands them: a file
 * that is not a complete backup must reach none of them, a safety copy of the
 * database must be written before psql loads anything, psql must load the
 * prepared copy of the dump (schema replaced, the setting an older server
 * rejects removed), migrations must run after a successful load and never
 * after a failed one, and a failed load must leave the uploads alone.
 */

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: jest.fn(),
}));

import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import request from 'supertest';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent } from '../../__tests__/helpers/websocket-test-server';
import logger from '../../utils/logger';

const app = createTestApp();
const execFileMock = execFile as unknown as jest.Mock;
const errorSpy = jest.spyOn(logger, 'error');

interface ToolCall {
  cmd: string;
  args: string[];
  /** What psql was given to load, read at the moment of the call (the file is deleted afterwards). */
  sqlLoaded?: string;
  /** The environment the tool was started with, when the route gave it one. */
  env?: Record<string, string>;
}

type Done = (err: Error | null, out?: { stdout: string; stderr: string }) => void;

/** Stand in for pg_dump, psql and the migration run; `fail` makes one of them exit non-zero. */
function stubTools(fail?: { cmd: string; stderr: string }): ToolCall[] {
  const calls: ToolCall[] = [];
  execFileMock.mockImplementation((cmd: string, args: string[], ...rest: unknown[]) => {
    const done = rest[rest.length - 1] as Done;
    const options = rest.length > 1 ? (rest[0] as { env?: Record<string, string> }) : undefined;
    const call: ToolCall = { cmd, args, env: options?.env };
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
    } else if (cmd === 'pg_dump' && fileFlag >= 0) {
      fs.writeFile(args[fileFlag + 1], SAFETY_DUMP).then(finish, finish);
    } else {
      finish();
    }
  });
  return calls;
}

/** What the stubbed pg_dump writes when the route takes its safety copy. */
const SAFETY_DUMP = '-- the database as it was before the restore\n';

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

/** Backups the route wrote during a test, removed afterwards. */
const written: string[] = [];

afterAll(async () => {
  await cleanupUsers([adminId, userId]);
  await Promise.all(written.map((f) => fs.unlink(f).catch(() => {})));
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
    written.push(path.join(process.env.BACKUP_DIR || 'backups', res.body.safetyBackup));

    expect(calls.map((c) => c.cmd)).toEqual(['pg_dump', 'psql', 'npx']);
    const [, psql, migrate] = calls;
    expect(psql.args).toEqual(expect.arrayContaining(['--single-transaction', 'ON_ERROR_STOP=1']));
    expect(path.basename(psql.args[psql.args.indexOf('--file') + 1])).not.toBe('database.sql');
    expect(psql.sqlLoaded).toMatch(/^\\restrict [A-Za-z0-9]+\nDROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\n/);
    expect(psql.sqlLoaded).not.toContain('\nSET transaction_timeout = 0;\n');
    expect(psql.sqlLoaded).toContain('CREATE TABLE public."Note"');
    expect(psql.sqlLoaded).not.toContain('OWNER TO');
    expect(psql.sqlLoaded).toContain('a1\tSET transaction_timeout = 0;\n');
    expect(migrate.args).toEqual(['prisma', 'migrate', 'deploy']);
  });

  it('writes a backup of the database as it is before loading anything, and names it', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

    const res = await restore(admin, zip);

    expect(res.status).toBe(200);
    const [dump] = calls;
    expect(dump.cmd).toBe('pg_dump');
    expect(dump.args).toEqual(expect.arrayContaining(['--clean', '--if-exists', '--no-owner', '--no-privileges']));
    const named = /(backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.zip)/.exec(res.body.message)?.[1];
    expect(named).toBeDefined();
    expect(res.body.safetyBackup).toBe(named);

    // It is an ordinary backup: listed with the others, and holding the dump pg_dump wrote.
    const list = await admin.get('/api/admin/backups');
    expect(list.body.backups.map((b: { filename: string }) => b.filename)).toContain(named);
    const file = path.join(process.env.BACKUP_DIR || 'backups', named!);
    written.push(file);
    const entries = (await unzipper.Open.file(file)).files.map((f) => f.path);
    expect(entries).toEqual(['database.sql']);

    // Readable by the backend's user alone: it holds every credential on the instance.
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
  });

  it('keeps the database password off the command line of every tool it runs', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });
    const password = /:\/\/[^:]+:([^@]+)@/.exec(process.env.DATABASE_URL ?? '')?.[1];
    expect(password).toBeDefined();

    expect((await restore(admin, zip)).status).toBe(200);

    const tools = calls.filter((c) => c.cmd === 'pg_dump' || c.cmd === 'psql');
    expect(tools.length).toBe(2);
    for (const call of tools) {
      // The address keeps its host and user but no `user:password@` part.
      const dbname = call.args[call.args.indexOf('--dbname') + 1];
      expect(dbname).toContain('@');
      expect(dbname).not.toMatch(/\/\/[^/@]*:[^/@]*@/);
      expect(call.env?.PGPASSWORD).toBe(decodeURIComponent(password!));
      expect(Object.keys(call.env ?? {}).sort()).toEqual(['PATH', 'PGPASSWORD']);
    }
    const named = /(backup-\S+\.zip)/.exec((await admin.get('/api/admin/backups')).body.backups[0]?.filename ?? '')?.[1];
    if (named) written.push(path.join(process.env.BACKUP_DIR || 'backups', named));
  });

  it('refuses a file that is not a complete backup before any tool runs', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': '' });

    const res = await restore(admin, zip);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid Backup');
    expect(res.body.message).toMatch(/cut short/);
    expect(res.body.message).toMatch(/Nothing was changed/);
    expect(calls).toEqual([]);
  });

  it('refuses a backup that would run a command, before any tool runs', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': '\\! id > /tmp/pwned\n' + DUMP_FROM_NEWER_CLIENT });

    const res = await restore(admin, zip);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid Backup');
    expect(res.body.message).toMatch(/psql command/);
    expect(calls).toEqual([]);
  });

  it('stops before loading when the safety copy cannot be written', async () => {
    const calls = stubTools({ cmd: 'pg_dump', stderr: 'pg_dump: error: connection failed' });
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

    const res = await restore(admin, zip);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Restore Failed');
    expect(res.body.message).toMatch(/backup of the current database/i);
    expect(calls.map((c) => c.cmd)).toEqual(['pg_dump']);
  });

  it('answers the restore, instead of exiting the process, when the safety copy fails while being written', async () => {
    stubTools();
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });
    // The zip's output stream fails once writing starts, as a full disk does.
    // A stream error with no listener is an uncaught exception, which took
    // the whole backend down in the middle of a restore.
    const probe = await fs.open(path.join(os.tmpdir(), `cozyvtt-stream-probe-${Date.now()}`), 'w');
    const proto = Object.getPrototypeOf(probe) as { createWriteStream: () => NodeJS.WritableStream };
    await probe.close();
    const failing = jest.spyOn(proto, 'createWriteStream').mockImplementation(() => {
      const stream = new PassThrough();
      process.nextTick(() => stream.destroy(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })));
      return stream;
    });
    try {
      const res = await restore(admin, zip);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Restore Failed');
      expect(res.body.message).toMatch(/backup of the current database/i);
    } finally {
      failing.mockRestore();
    }
  });

  it('says the database was restored but the files were not when copying them fails', async () => {
    const marker = `restore-test-${Date.now()}`;
    const uploads = process.env.UPLOAD_DIR || 'uploads';
    // A file where the archive has a directory: the copy cannot replace one with the other.
    await fs.mkdir(uploads, { recursive: true });
    await fs.writeFile(path.join(uploads, marker), 'in the way');
    const calls = stubTools();
    const zip = await backupZip({
      'database.sql': DUMP_FROM_NEWER_CLIENT,
      [`uploads/${marker}/marker.txt`]: 'cannot land',
    });

    try {
      const res = await restore(admin, zip);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Restore Incomplete');
      expect(res.body.message).toMatch(/files/);
      // The database side still finishes, migrations included, so what was restored is usable.
      expect(calls.map((c) => c.cmd)).toEqual(['pg_dump', 'psql', 'npx']);
      const named = /(backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.zip)/.exec(res.body.message)?.[1];
      if (named) written.push(path.join(process.env.BACKUP_DIR || 'backups', named));
    } finally {
      await fs.rm(path.join(uploads, marker), { force: true });
    }
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
    expect(calls.map((c) => c.cmd)).toEqual(['pg_dump', 'psql']);
    const named = /(backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.zip)/.exec(res.body.message)?.[1];
    if (named) written.push(path.join(process.env.BACKUP_DIR || 'backups', named));
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
    expect(calls.map((c) => c.cmd)).toEqual(['pg_dump', 'psql', 'npx']);
    const named = /(backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.zip)/.exec(res.body.message)?.[1];
    if (named) written.push(path.join(process.env.BACKUP_DIR || 'backups', named));
  });

  it('ends every live connection once the database has been replaced', async () => {
    // The restored database holds whatever accounts and memberships the
    // backup had, and no session at all; a socket that stayed open would keep
    // acting on the cached identity and role it had before.
    const ws = await createWsTestServer();
    try {
      const cookie = await ws.loginAs(userId);
      const client = await ws.connectClient(cookie);
      const told = waitForEvent<{ message: string }>(client, 'error');
      const dropped = new Promise<string>((resolve) => client.on('disconnect', (reason: string) => resolve(reason)));
      const calls = stubTools();
      const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

      const res = await restore(admin, zip);

      expect(res.status).toBe(200);
      written.push(path.join(process.env.BACKUP_DIR || 'backups', res.body.safetyBackup));
      expect(calls.map((c) => c.cmd)).toEqual(['pg_dump', 'psql', 'npx']);
      expect((await told).message).toMatch(/restored/i);
      expect(await dropped).toBe('io server disconnect');
    } finally {
      await ws.close();
    }
  });

  it('refuses anyone who is not a platform administrator', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

    const res = await restore(user, zip);

    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe('POST /api/admin/backups', () => {
  const dir = () => process.env.BACKUP_DIR || 'backups';
  /** Every backup in a test is asked for in the same second. */
  let clock: jest.SpyInstance;

  beforeAll(async () => {
    await fs.mkdir(path.resolve(process.env.UPLOAD_DIR || 'uploads'), { recursive: true });
  });

  beforeEach(() => {
    clock = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-09-27T14:43:06.000Z');
  });

  afterEach(() => {
    clock.mockRestore();
  });

  it('gives two backups made in the same second different names, and keeps the first as it was', async () => {
    stubTools();
    const first = await admin.post('/api/admin/backups');
    expect(first.status).toBe(201);
    const firstFile = path.join(dir(), first.body.filename);
    written.push(firstFile);
    // A mark on the first file: a second backup that reused its name would wipe it.
    await fs.appendFile(firstFile, 'kept');
    const marked = (await fs.stat(firstFile)).size;

    const second = await admin.post('/api/admin/backups');
    expect(second.status).toBe(201);
    written.push(path.join(dir(), second.body.filename));

    expect(first.body.filename).toBe('backup-2026-09-27T14-43-06.zip');
    expect(second.body.filename).toBe('backup-2026-09-27T14-43-06-2.zip');
    expect((await fs.stat(firstFile)).size).toBe(marked);
    const names = (await admin.get('/api/admin/backups')).body.backups.map((b: { filename: string }) => b.filename);
    expect(names).toEqual(expect.arrayContaining([first.body.filename, second.body.filename]));
    expect((await fs.stat(path.join(dir(), second.body.filename))).mode & 0o777).toBe(0o600);
  });

  it("names a restore's safety copy apart from a backup made in the same second, and leaves that backup alone", async () => {
    stubTools();
    const made = await admin.post('/api/admin/backups');
    expect(made.status).toBe(201);
    const madeFile = path.join(dir(), made.body.filename);
    written.push(madeFile);
    await fs.appendFile(madeFile, 'kept');
    const marked = (await fs.stat(madeFile)).size;

    const res = await restore(admin, await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT }));
    expect(res.status).toBe(200);
    written.push(path.join(dir(), res.body.safetyBackup));

    expect(res.body.safetyBackup).not.toBe(made.body.filename);
    expect((await fs.stat(madeFile)).size).toBe(marked);
    const names = (await admin.get('/api/admin/backups')).body.backups.map((b: { filename: string }) => b.filename);
    expect(names).toContain(res.body.safetyBackup);
  });
});
