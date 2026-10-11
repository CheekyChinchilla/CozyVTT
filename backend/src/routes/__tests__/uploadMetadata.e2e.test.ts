/**
 * What an upload may say about itself: its name, description and tags.
 *
 * The upload route stored these as sent. A name or description could be most
 * of a megabyte and the tags hundreds of thousands of entries, all listed to
 * every member of a campaign, or to everyone for a global asset; a field sent
 * twice arrived as a list and answered 500. They are now held to the limits
 * the typed-document route already has, and a refused upload leaves no file.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-upload-meta-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

/** A tiny valid PNG. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
    '789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
);

let userId: string;
let agent: request.Agent;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Upload Metadata Tester' });
  userId = user.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

/** Every file under the uploads folder, so a refused upload can be shown to leave none. */
function filesOnDisk(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(full);
    }
  };
  walk(UPLOAD_DIR);
  return found;
}

type Fields = Array<[string, string]>;

function upload(fields: Fields, filename = 'token.png') {
  let req = agent.post('/api/assets/upload').field('type', 'TOKEN').field('scope', 'USER');
  for (const [name, value] of fields) req = req.field(name, value);
  return req.attach('file', PNG, filename);
}

async function expectRefused(fields: Fields, message: RegExp) {
  const before = filesOnDisk().length;
  const assets = await prisma.asset.count({ where: { uploadedById: userId } });
  const res = await upload(fields);
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(message);
  expect(await prisma.asset.count({ where: { uploadedById: userId } })).toBe(assets);
  expect(filesOnDisk().length).toBe(before);
}

describe('POST /api/assets/upload metadata', () => {
  it('refuses a name over 200 characters', async () => {
    await expectRefused([['name', 'n'.repeat(201)]], /name must be 200 characters or fewer/);
  });

  it('refuses a description over 1,000 characters', async () => {
    await expectRefused([['description', 'd'.repeat(1001)]], /description must be 1000 characters or fewer/);
  });

  it('refuses more than 50 tags, or a tag over 50 characters', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `tag${i}`).join(',');
    await expectRefused([['tags', many]], /at most 50 tags/i);
    await expectRefused([['tags', `ok,${'t'.repeat(51)}`]], /tag must be 50 characters or fewer/i);
  });

  it('refuses a field sent twice, without a server error', async () => {
    await expectRefused([['name', 'One'], ['name', 'Two']], /once/);
  });

  it('refuses a field value too long to be any of them', async () => {
    const res = await upload([['description', 'x'.repeat(20 * 1024)]]);
    expect(res.status).toBe(400);
  });

  it('stores the name and description trimmed, and each tag once', async () => {
    const res = await upload([
      ['name', '  Goblin Boss  '],
      ['description', '  Leader of the cave  '],
      ['tags', ' goblin, boss ,goblin,, '],
    ]);
    expect(res.status).toBe(201);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id } });
    expect(asset.name).toBe('Goblin Boss');
    expect(asset.description).toBe('Leader of the cave');
    expect(asset.tags).toEqual(['goblin', 'boss']);
  });

  it('keeps a long file name to 255 characters, and a name taken from it to 200, with its extension', async () => {
    const longName = `${'f'.repeat(400)}.png`;
    const res = await upload([], longName);
    expect(res.status).toBe(201);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id } });
    expect(asset.originalName).toHaveLength(255);
    expect(asset.originalName.endsWith('.png')).toBe(true);
    expect(asset.name).toHaveLength(200);
    expect(asset.name.endsWith('.png')).toBe(true);
  });
});
