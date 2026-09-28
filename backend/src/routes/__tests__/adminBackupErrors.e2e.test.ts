/**
 * What a failed Admin Dashboard backup says.
 *
 * "pg_dump is not installed" was the answer to any error coded ENOENT, and
 * since the dump is written into a private temporary folder, a missing or
 * unusable temporary folder carries that code too: the self-hoster was told
 * to rebuild an image that was fine.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fsSync from 'fs';
import os from 'os';
import path from 'path';

const BACKUP_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-backup-errors-'));
process.env.BACKUP_DIR = BACKUP_DIR;

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: jest.fn(),
}));

import { execFile } from 'child_process';
import fs from 'fs/promises';
import request from 'supertest';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const execFileMock = execFile as unknown as jest.Mock;
let adminId: string;
let admin: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ role: PlatformRole.ADMIN, displayName: 'Backup errors admin' });
  adminId = user.id;
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterEach(() => {
  jest.restoreAllMocks();
  execFileMock.mockReset();
});

afterAll(async () => {
  await cleanupUsers([adminId]);
  fsSync.rmSync(BACKUP_DIR, { recursive: true, force: true });
});

it('says pg_dump is missing when pg_dump cannot be started', async () => {
  execFileMock.mockImplementation((_cmd: string, _args: string[], ...rest: unknown[]) => {
    const done = rest[rest.length - 1] as (err: Error | null) => void;
    done(Object.assign(new Error('spawn pg_dump ENOENT'), { code: 'ENOENT', syscall: 'spawn pg_dump', path: 'pg_dump' }));
  });
  const res = await admin.post('/api/admin/backups');
  expect(res.status).toBe(500);
  expect(res.body.message).toMatch(/pg_dump is not installed/);
});

it('does not blame pg_dump when the temporary folder cannot be used', async () => {
  jest.spyOn(fs, 'mkdtemp').mockRejectedValueOnce(Object.assign(new Error("ENOENT: no such file or directory, mkdtemp '/tmp/cozyvtt-db-'"), { code: 'ENOENT' }));
  const res = await admin.post('/api/admin/backups');
  expect(res.status).toBe(500);
  expect(res.body.message).not.toMatch(/not installed/);
  expect(res.body.message).toMatch(/temporary/i);
  expect(execFileMock).not.toHaveBeenCalled();
});
