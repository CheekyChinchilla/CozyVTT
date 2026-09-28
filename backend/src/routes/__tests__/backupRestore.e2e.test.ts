/**
 * The restore route, with the database tools stubbed.
 *
 * pg_dump, psql and the migration run are child processes, so the test
 * replaces child_process.execFile and checks what the route hands them: a file
 * that is not a complete backup must reach none of them, a safety copy of the
 * database must be written before psql loads anything, psql must load the
 * prepared copy of the dump (schema replaced, the setting an older server
 * rejects removed), migrations must run after a successful load and never
 * after a failed one, and a failed load must leave the uploads alone. Live
 * connections end once the load has committed, whatever fails after it.
 */

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: jest.fn(),
}));

import { execFile } from 'child_process';
import fsSync from 'fs';
import fs, { type FileHandle } from 'fs/promises';
import os from 'os';
import path from 'path';

// A restore writes a safety backup and copies uploaded files, and a backup
// reads the uploads, so this file gives the app folders of its own, removed
// in afterAll however the tests went. Set before the app is imported: the
// admin routes read both when they load.
const SCRATCH = fsSync.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-backup-restore-'));
const BACKUP_DIR = path.join(SCRATCH, 'backups');
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
process.env.BACKUP_DIR = BACKUP_DIR;
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { PassThrough } from 'stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import request from 'supertest';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent } from '../../__tests__/helpers/websocket-test-server';
import { expectFileMode, expectModeBits } from '../../__tests__/helpers/fileModes';
import {
  clearState as clearCombatState,
  getState as getCombatState,
  setState as setCombatState,
} from '../../websocket/initiativeState';
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
  /** The tool's `--file` once it has been written or read: its permission bits, its folder's, and what else that folder holds. */
  file?: { mode: number; dir: string; dirMode: number; beside: string[] };
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
    const file = fileFlag >= 0 ? args[fileFlag + 1] : undefined;
    const touch = async () => {
      if (file === undefined) return;
      // pg_dump creates its file with the default mode, as this does.
      if (cmd === 'pg_dump') await fs.writeFile(file, SAFETY_DUMP);
      else if (cmd === 'psql') call.sqlLoaded = await fs.readFile(file, 'utf8');
      else return;
      const dir = path.dirname(file);
      call.file = {
        mode: (await fs.stat(file)).mode & 0o777,
        dir,
        dirMode: (await fs.stat(dir)).mode & 0o777,
        beside: await fs.readdir(dir),
      };
    };
    touch().then(finish, finish);
  });
  return calls;
}

/**
 * Run with os.tmpdir() pointing at a folder every account on the machine can
 * read and write, as a shared host's /tmp is. What the route puts there while
 * it works is a copy of the whole database.
 */
async function withSharedTmp(run: (tmp: string) => Promise<void>): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-shared-tmp-'));
  await fs.chmod(tmp, 0o777);
  // Jest gives each test file its own copy of process.env, which os.tmpdir() does not read.
  const tmpdir = jest.spyOn(os, 'tmpdir').mockReturnValue(tmp);
  try {
    await run(tmp);
  } finally {
    tmpdir.mockRestore();
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/** What is left in `dir` once a restore's clean-up, which runs after it has answered, has had time to finish. */
async function leftIn(dir: string): Promise<string[]> {
  for (let tries = 0; tries < 50; tries++) {
    const left = await fs.readdir(dir);
    if (left.length === 0) return left;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return fs.readdir(dir);
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

afterAll(async () => {
  try {
    await cleanupUsers([adminId, userId]);
  } finally {
    // The shared afterAll in helpers/jest.afterEnv.ts is declared first, so it
    // has already let the clients go, and the clean-up above opened this one
    // again.
    await prisma.$disconnect();
    await fs.rm(SCRATCH, { recursive: true, force: true });
  }
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
    const file = path.join(BACKUP_DIR, named!);
    const entries = (await unzipper.Open.file(file)).files.map((f) => f.path);
    expect(entries).toEqual(['database.sql']);

    // Readable by the backend's user alone: it holds every credential on the instance.
    await expectFileMode(file, 0o777, 0o600);
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
    const probe = await fs.open(path.join(SCRATCH, 'stream-probe'), 'w');
    const proto = Object.getPrototypeOf(probe) as { createWriteStream(this: FileHandle): NodeJS.WritableStream };
    await probe.close();
    const failing = jest.spyOn(proto, 'createWriteStream').mockImplementation(function (this: FileHandle) {
      const stream = new PassThrough();
      // A real stream closes the file when it is destroyed; this stand-in
      // does the same, or the backup's handle is left open.
      stream.on('close', () => { void this.close(); });
      process.nextTick(() => stream.destroy(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })));
      return stream;
    });
    try {
      const res = await restore(admin, zip);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Restore Failed');
      expect(res.body.message).toMatch(/backup of the current database/i);
      // A full disk is the backups folder's problem, and freeing room there
      // keeps the undo; the command-line restore takes no safety copy.
      expect(res.body.message).toMatch(/backups folder/);
      expect(res.body.message).toMatch(/Nothing was restored/);
    } finally {
      failing.mockRestore();
    }
  });

  it('names the backups folder when a new backup fills its disk', async () => {
    stubTools();
    const probe = await fs.open(path.join(SCRATCH, 'stream-probe'), 'w');
    const proto = Object.getPrototypeOf(probe) as { createWriteStream(this: FileHandle): NodeJS.WritableStream };
    await probe.close();
    const failing = jest.spyOn(proto, 'createWriteStream').mockImplementation(function (this: FileHandle) {
      const stream = new PassThrough();
      stream.on('close', () => { void this.close(); });
      process.nextTick(() => stream.destroy(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })));
      return stream;
    });
    try {
      const res = await admin.post('/api/admin/backups');
      expect(res.status).toBe(500);
      expect(res.body.message).toMatch(/backups folder/);
    } finally {
      failing.mockRestore();
    }
  });

  // The uploaded backup is saved into the backups folder before the route
  // runs, so a folder the backend cannot write to refused it there, and the
  // page said only "An unexpected error occurred".
  it('names the backups folder, and says nothing changed, when the uploaded backup cannot be saved there', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });
    const original = fsSync.createWriteStream;
    const failing = jest.spyOn(fsSync, 'createWriteStream').mockImplementation((file, options) => {
      if (!String(file).includes('restore-temp-')) return original(file, options);
      const stream = original(path.join(SCRATCH, 'upload-probe'), options);
      process.nextTick(() => stream.destroy(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })));
      return stream;
    });
    try {
      const res = await restore(admin, zip);
      expect(res.status).toBe(500);
      expect(res.body.message).toMatch(/backups folder/);
      expect(res.body.message).toMatch(/Nothing was changed/);
      expect(calls).toEqual([]);
    } finally {
      failing.mockRestore();
    }
  });

  // The backup is unpacked into the temporary folder before anything else:
  // a folder that cannot be made there, or fills while unpacking, was
  // answered "An unexpected error occurred", with no word that nothing had
  // changed.
  it('says the temporary folder could not be used, and that nothing changed, when it cannot be made', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });
    const original = fs.mkdtemp.bind(fs);
    const refused = jest.spyOn(fs, 'mkdtemp').mockImplementation(((prefix: string) =>
      prefix.includes('cozyvtt-restore-')
        ? Promise.reject(Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }))
        : original(prefix)) as never);
    try {
      const res = await restore(admin, zip);
      expect(res.status).toBe(500);
      expect(res.body.message).toMatch(/temporary folder/);
      expect(res.body.message).toMatch(/Nothing was changed/);
      expect(calls).toEqual([]);
    } finally {
      refused.mockRestore();
    }
  });

  it('says the temporary folder could not take the working copy, and that nothing changed, when writing it fails', async () => {
    const calls = stubTools();
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });
    // Only the file psql would load fails, as it does when the temporary
    // folder fills while the unpacked backup is copied into it.
    const original = fsSync.createWriteStream;
    const failing = jest.spyOn(fsSync, 'createWriteStream').mockImplementation((file, options) => {
      if (!String(file).endsWith('restore.sql')) return original(file, options);
      const stream = original(path.join(SCRATCH, 'restore-probe'), options);
      process.nextTick(() => stream.destroy(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })));
      return stream;
    });
    try {
      const res = await restore(admin, zip);
      expect(res.status).toBe(500);
      expect(res.body.message).toMatch(/temporary folder/);
      expect(res.body.message).toMatch(/Nothing was changed/);
      expect(calls).toEqual([]);
    } finally {
      failing.mockRestore();
    }
  });

  it('says the database was restored but the files were not when copying them fails', async () => {
    const marker = `restore-test-${Date.now()}`;
    // A file where the archive has a directory: the copy cannot replace one with the other.
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, marker), 'in the way');
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
    } finally {
      await fs.rm(path.join(UPLOAD_DIR, marker), { force: true });
    }
  });

  it('answers 500 when the load fails, runs no migration, copies no uploads and leaves combat alone', async () => {
    const marker = `restore-test-${Date.now()}`;
    const campaignId = `restore-combat-${Date.now()}`;
    setCombatState(campaignId, { active: true, round: 3, currentTokenId: null, combatants: [] });
    const calls = stubTools({ cmd: 'psql', stderr: 'ERROR:  unrecognized configuration parameter "transaction_timeout"' });
    const zip = await backupZip({
      'database.sql': DUMP_FROM_NEWER_CLIENT,
      [`uploads/${marker}/marker.txt`]: 'must not be copied',
    });

    const res = await restore(admin, zip);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Restore Failed');
    expect(calls.map((c) => c.cmd)).toEqual(['pg_dump', 'psql']);
    // The log carries psql's own words and never the command line, which holds the database URL and its password.
    const logged = JSON.stringify(errorSpy.mock.calls.filter((c) => String(c[0]).includes('psql restore error')));
    expect(logged).toContain('unrecognized configuration parameter');
    expect(logged).not.toContain('postgresql://');
    await expect(fs.access(path.join(UPLOAD_DIR, marker))).rejects.toBeDefined();
    expect(getCombatState(campaignId).active).toBe(true);
    clearCombatState(campaignId);
  });

  it('says the database was restored but not migrated when the migration run fails', async () => {
    const calls = stubTools({ cmd: 'npx', stderr: 'Error: P1001' });
    const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

    const res = await restore(admin, zip);

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/restart/i);
    expect(calls.map((c) => c.cmd)).toEqual(['pg_dump', 'psql', 'npx']);
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
      expect(calls.map((c) => c.cmd)).toEqual(['pg_dump', 'psql', 'npx']);
      expect((await told).message).toMatch(/restored/i);
      expect(await dropped).toBe('io server disconnect');
    } finally {
      await ws.close();
    }
  });

  it('still ends every live connection and forgets combat when the migration run fails after the load', async () => {
    // The load has committed by then, so the database is the backup's whether
    // or not the migrations succeed, and a socket left open would keep the
    // identity and role it cached from the database that was replaced.
    const ws = await createWsTestServer();
    const campaignId = `restore-combat-${Date.now()}`;
    setCombatState(campaignId, { active: true, round: 3, currentTokenId: null, combatants: [] });
    try {
      const cookie = await ws.loginAs(userId);
      const client = await ws.connectClient(cookie);
      const told = waitForEvent<{ message: string }>(client, 'error');
      const dropped = new Promise<string>((resolve) => client.on('disconnect', (reason: string) => resolve(reason)));
      const calls = stubTools({ cmd: 'npx', stderr: 'Error: P1001' });
      const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

      const res = await restore(admin, zip);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Restore Incomplete');
      expect(res.body.message).toMatch(/restart/i);
      expect(calls.map((c) => c.cmd)).toEqual(['pg_dump', 'psql', 'npx']);
      expect((await told).message).toMatch(/restored/i);
      expect(await dropped).toBe('io server disconnect');
      expect(getCombatState(campaignId).active).toBe(false);
    } finally {
      clearCombatState(campaignId);
      await ws.close();
    }
  });

  it('unpacks the backup and writes the file psql loads where no other account can read them, and removes both', async () => {
    await withSharedTmp(async (tmp) => {
      const calls = stubTools();
      const zip = await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT });

      const res = await restore(admin, zip);

      expect(res.status).toBe(200);
      const loaded = calls.find((c) => c.cmd === 'psql')?.file;
      expect(loaded).toBeDefined();
      expect(path.dirname(loaded!.dir)).toBe(tmp);
      expect(loaded!.beside).toEqual(expect.arrayContaining(['database.sql', 'restore.sql']));
      expectModeBits(loaded!.dirMode, 0o077, 0);
      expectModeBits(loaded!.mode, 0o077, 0);
      const dumped = calls.find((c) => c.cmd === 'pg_dump')?.file;
      expectModeBits(dumped!.dirMode, 0o077, 0);
      expect(await leftIn(tmp)).toEqual([]);
    });
  });

  it('removes the unpacked backup when it is refused', async () => {
    await withSharedTmp(async (tmp) => {
      stubTools();
      const res = await restore(admin, await backupZip({ 'database.sql': '' }));

      expect(res.status).toBe(400);
      expect(await leftIn(tmp)).toEqual([]);
    });
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
  /** Every backup in a test is asked for in the same second. */
  let clock: jest.SpyInstance;

  beforeAll(async () => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  });

  beforeEach(() => {
    clock = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-09-27T14:43:06.000Z');
  });

  afterEach(() => {
    clock.mockRestore();
  });

  // A backup's file used to exist under its name from the moment the name was
  // taken: empty while pg_dump ran, part-written while it was zipped. A
  // backend stopped in between left that file behind, listed and downloadable
  // as a finished backup. It is now written under a name the list never
  // shows, and renamed once it is complete.
  it('writes a backup under a name no backup has until it is complete', async () => {
    stubTools();
    const stub = execFileMock.getMockImplementation();
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    let started = () => {};
    const dumping = new Promise<void>((resolve) => { started = resolve; });
    execFileMock.mockImplementation((cmd: string, ...rest: unknown[]) => {
      if (cmd !== 'pg_dump') return stub?.(cmd, ...rest);
      started();
      void held.then(() => stub?.(cmd, ...rest));
    });
    const named = (files: string[]) => files.filter((f) => /^backup-.*\.zip$/.test(f));
    const before = named(await fs.readdir(BACKUP_DIR).catch(() => []));
    const making = admin.post('/api/admin/backups').then((res) => res);
    try {
      await dumping;
      expect(named(await fs.readdir(BACKUP_DIR))).toEqual(before);
      const listed = (await admin.get('/api/admin/backups')).body.backups.map((b: { filename: string }) => b.filename);
      expect(listed.sort()).toEqual([...before].sort());
    } finally {
      release();
    }
    const made = await making;
    expect(made.status).toBe(201);
    const name = made.body.filename;
    expect(named(await fs.readdir(BACKUP_DIR))).toContain(name);
    expect((await fs.readdir(BACKUP_DIR)).filter((f) => f.endsWith('.partial'))).toEqual([]);
    const after = (await admin.get('/api/admin/backups')).body.backups.map((b: { filename: string }) => b.filename);
    expect(after).toContain(name);
    // The next case counts on having this second's name to itself.
    await fs.rm(path.join(BACKUP_DIR, name), { force: true });
  });

  it('removes what a backup the backend was stopped partway through left behind', async () => {
    const left = path.join(BACKUP_DIR, 'backup-2026-01-02T03-04-05.zip.partial');
    await fs.writeFile(left, 'half an archive');
    const listed = (await admin.get('/api/admin/backups')).body.backups.map((b: { filename: string }) => b.filename);
    expect(listed).not.toContain('backup-2026-01-02T03-04-05.zip');
    await expect(fs.access(left)).rejects.toThrow();
  });

  it('gives two backups made in the same second different names, and keeps the first as it was', async () => {
    stubTools();
    const first = await admin.post('/api/admin/backups');
    expect(first.status).toBe(201);
    const firstFile = path.join(BACKUP_DIR, first.body.filename);
    // A mark on the first file: a second backup that reused its name would wipe it.
    await fs.appendFile(firstFile, 'kept');
    const marked = (await fs.stat(firstFile)).size;

    const second = await admin.post('/api/admin/backups');
    expect(second.status).toBe(201);

    expect(first.body.filename).toBe('backup-2026-09-27T14-43-06.zip');
    expect(second.body.filename).toBe('backup-2026-09-27T14-43-06-2.zip');
    expect((await fs.stat(firstFile)).size).toBe(marked);
    const names = (await admin.get('/api/admin/backups')).body.backups.map((b: { filename: string }) => b.filename);
    expect(names).toEqual(expect.arrayContaining([first.body.filename, second.body.filename]));
    await expectFileMode(path.join(BACKUP_DIR, second.body.filename), 0o777, 0o600);
  });

  it('has pg_dump write into a folder no other account can open, and leaves nothing behind', async () => {
    await withSharedTmp(async (tmp) => {
      const calls = stubTools();

      const res = await admin.post('/api/admin/backups');

      expect(res.status).toBe(201);
      const dumped = calls.find((c) => c.cmd === 'pg_dump')?.file;
      expect(dumped).toBeDefined();
      expect(path.dirname(dumped!.dir)).toBe(tmp);
      expectModeBits(dumped!.dirMode, 0o077, 0);
      expect(await fs.readdir(tmp)).toEqual([]);
    });
  });

  it('removes the dump and its folder when pg_dump fails', async () => {
    await withSharedTmp(async (tmp) => {
      const calls = stubTools({ cmd: 'pg_dump', stderr: 'pg_dump: error: connection failed' });

      const res = await admin.post('/api/admin/backups');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Backup Failed');
      expectModeBits(calls.find((c) => c.cmd === 'pg_dump')?.file?.dirMode, 0o777, 0o700);
      expect(await fs.readdir(tmp)).toEqual([]);
    });
  });

  it("names a restore's safety copy apart from a backup made in the same second, and leaves that backup alone", async () => {
    stubTools();
    const made = await admin.post('/api/admin/backups');
    expect(made.status).toBe(201);
    const madeFile = path.join(BACKUP_DIR, made.body.filename);
    await fs.appendFile(madeFile, 'kept');
    const marked = (await fs.stat(madeFile)).size;

    const res = await restore(admin, await backupZip({ 'database.sql': DUMP_FROM_NEWER_CLIENT }));
    expect(res.status).toBe(200);

    expect(res.body.safetyBackup).not.toBe(made.body.filename);
    expect((await fs.stat(madeFile)).size).toBe(marked);
    const names = (await admin.get('/api/admin/backups')).body.backups.map((b: { filename: string }) => b.filename);
    expect(names).toContain(res.body.safetyBackup);
  });
});
