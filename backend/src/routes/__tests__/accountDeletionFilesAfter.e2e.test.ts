/**
 * Deleting an account answers once the account is gone, and removes the
 * personal files after.
 *
 * Working out which of the person's files may go costs about seven queries
 * each, and the routes waited for all of them before answering, so a person
 * with many uploads waited on a request whose account had already been
 * deleted. The files are now removed after the answer; a failure is logged,
 * since nobody is waiting to be told, and a shutdown waits for the removal.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

// Every limiter lets the request through. The rest of the package stays
// real: the sign-in limiter keys an address with its ipKeyGenerator.
jest.mock('express-rate-limit', () => ({
  ...jest.requireActual<typeof import('express-rate-limit')>('express-rate-limit'),
  __esModule: true,
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { PlatformRole } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import * as assetUsage from '../../services/assetUsage';
import { personalFilesBeingRemoved } from '../../services/accountDeletion';
import logger from '../../utils/logger';

const app = createTestApp();
const userIds: string[] = [];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-account-files-after-'));

async function member(label: string, role?: PlatformRole) {
  const user = await createTestUser({ displayName: label, ...(role && { role }) });
  userIds.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

/** A personal token with its file on disk. */
async function personalToken(uploadedById: string) {
  const filePath = path.join(dir, `${randomUUID()}.png`);
  fs.writeFileSync(filePath, 'bytes');
  return prisma.asset.create({
    data: {
      type: 'TOKEN', scope: 'USER', uploadedById, filename: path.basename(filePath), originalName: 'mine.png',
      mimeType: 'image/png', fileSize: 5, filePath, name: 'Personal TOKEN',
    },
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls until `done` holds, up to three seconds. */
async function eventually(done: () => Promise<boolean>): Promise<boolean> {
  for (let waited = 0; waited < 3000; waited += 50) {
    if (await done()) return true;
    await sleep(50);
  }
  return false;
}

/** Makes the check that decides whether a file is in use wait until `release` is called. */
function holdTheUseCheck() {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  jest.spyOn(assetUsage, 'isAssetInUse').mockImplementation(async () => {
    await held;
    return false;
  });
  return release;
}

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { OR: [{ uploadedById: { in: userIds } }, { name: 'Personal TOKEN', uploadedById: null }] } });
  await cleanupUsers(userIds);
  fs.rmSync(dir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe.each([
  ['DELETE /api/auth/account', async () => {
    const leaver = await member('Answer First Leaver');
    return { leaver, send: () => leaver.agent.delete('/api/auth/account').send({ password: TEST_PASSWORD }) };
  }],
  ['DELETE /api/users/:id', async () => {
    const admin = await member('Answer First Admin', PlatformRole.ADMIN);
    const leaver = await member('Answer First Target');
    return { leaver, send: () => admin.agent.delete(`/api/users/${leaver.user.id}`) };
  }],
])('%s', (_route, setUp) => {
  it('answers before the personal files are removed, then removes them', async () => {
    const { leaver, send } = await setUp();
    const file = await personalToken(leaver.user.id);
    const release = holdTheUseCheck();

    const pending = send().then((res) => res);
    const first = await Promise.race([
      pending.then(() => 'answered' as const),
      sleep(1500).then(() => 'still waiting' as const),
    ]);
    const stillStored = first === 'answered' ? await prisma.asset.findUnique({ where: { id: file.id } }) : null;
    release();
    await pending;

    expect(first).toBe('answered');
    expect((await pending).status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: leaver.user.id } })).toBeNull();
    expect(stillStored).not.toBeNull();
    // The record goes first and the file after it; wait for both.
    await personalFilesBeingRemoved.finished();
    expect(await prisma.asset.findUnique({ where: { id: file.id } })).toBeNull();
    expect(fs.existsSync(file.filePath)).toBe(false);
  });

  it('logs a failure to remove them, and has answered success regardless', async () => {
    const { leaver, send } = await setUp();
    await personalToken(leaver.user.id);
    jest.spyOn(assetUsage, 'isAssetInUse').mockRejectedValue(new Error('database went away'));
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

    const res = await send();

    expect(res.status).toBe(200);
    expect(await eventually(async () => logged.mock.calls.some(([message]) => String(message).includes('personal files could not all be removed')))).toBe(true);
  });
});
