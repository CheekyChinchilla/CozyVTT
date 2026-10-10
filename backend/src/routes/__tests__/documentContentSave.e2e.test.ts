/**
 * Saving the text of a document.
 *
 * The save wrote the new text straight over the file. Opening the file for
 * writing empties it first, so a save that stopped partway left the document
 * empty or cut off, with the earlier text gone. A delete that landed during a
 * save left the file the save had written with no row naming it, and the
 * save answered 500.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-document-save-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const userIds: string[] = [];

async function signedIn() {
  const user = await createTestUser({ displayName: 'Document Saver' });
  userIds.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

async function documentWith(agent: ReturnType<typeof request.agent>, content: string) {
  const res = await agent.post('/api/assets/documents').send({ name: 'Session notes', format: 'md', content, scope: 'USER' });
  expect(res.status).toBe(201);
  const id: string = res.body.asset.id;
  const { filePath } = await prisma.asset.findUniqueOrThrow({ where: { id }, select: { filePath: true } });
  return { id, filePath };
}

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: userIds } } });
  await cleanupUsers(userIds);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

it('keeps the previous text when a save stops partway through writing', async () => {
  const agent = await signedIn();
  const before = '# Session one\n\nThe party met in a tavern.\n';
  const { id, filePath } = await documentWith(agent, before);
  const filesBefore = fs.readdirSync(path.dirname(filePath)).sort();

  // What a crash inside writeFile looks like on disk: the file it was writing
  // is opened, emptied, given part of the new text, and then nothing more.
  const realWriteFile = fs.promises.writeFile.bind(fs.promises);
  jest.spyOn(fs.promises, 'writeFile').mockImplementationOnce(async (target, data) => {
    const text = typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8');
    await realWriteFile(target as string, text.slice(0, 5));
    throw new Error('simulated crash mid-write');
  });

  const res = await agent.put(`/api/assets/documents/${id}/content`).send({ content: '# Session two\n\nA dragon arrived.\n' });
  expect(res.status).toBe(500);

  expect(fs.readFileSync(filePath, 'utf8')).toBe(before);
  // Nothing half-written is left beside it either.
  expect(fs.readdirSync(path.dirname(filePath)).sort()).toEqual(filesBefore);
});

it('replaces the text whole on a save that completes', async () => {
  const agent = await signedIn();
  const { id, filePath } = await documentWith(agent, 'first');

  const after = 'x'.repeat(600 * 1024);
  const res = await agent.put(`/api/assets/documents/${id}/content`).send({ content: after });
  expect(res.status).toBe(200);
  expect(res.body.asset.fileSize).toBe(after.length);
  expect(fs.readFileSync(filePath, 'utf8')).toBe(after);
});

it('leaves no file behind when the document is deleted while the save is writing', async () => {
  const agent = await signedIn();
  const { id, filePath } = await documentWith(agent, 'about to go');

  // The delete route removes the row and then the file, here just before the
  // save writes. The save brings the file back; when it then finds no row to
  // update, the file it wrote is its own to remove.
  const realWriteFile = fs.promises.writeFile.bind(fs.promises);
  jest.spyOn(fs.promises, 'writeFile').mockImplementationOnce(async (target, data, options) => {
    await prisma.asset.delete({ where: { id } });
    fs.rmSync(filePath);
    return realWriteFile(target, data, options);
  });

  const res = await agent.put(`/api/assets/documents/${id}/content`).send({ content: 'written after the delete' });
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('Document not found');
  expect(fs.existsSync(filePath)).toBe(false);
});
