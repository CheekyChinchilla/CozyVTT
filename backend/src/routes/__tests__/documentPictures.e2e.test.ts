/**
 * The pictures a handout shows, kept as the handout is written.
 *
 * A map picture a campaign's players may not see yet shows to them in a
 * handout the GM shares, and each player's Asset Library, and each read of
 * such a picture, asked which pictures the shared handouts name. That was
 * found by reading every shared handout's file on every request, so the work
 * a request did grew with the campaign's handouts: past a few hundred, a cache
 * of what each named stopped holding them and one player's list took seconds
 * of the server's time. What a document names is now kept when it is
 * uploaded, written or saved, and the requests read that. A document from
 * before is read a few at a time, by the requests, until none is left.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-document-pictures-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

type Agent = ReturnType<typeof request.agent>;

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
    '789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
);

const user = { gm: '', player: '' };
let campaignId = '';
let gm: Agent;
let player: Agent;

async function login(email: string): Promise<Agent> {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

/** A map picture in the campaign's library that no map uses: kept from its players. */
async function picture(label: string): Promise<string> {
  const filename = `${label}-${Date.now()}-${Math.random()}.png`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, PNG);
  const asset = await prisma.asset.create({
    data: {
      type: 'MAP', scope: 'CAMPAIGN', campaignId, uploadedById: user.gm, filename, originalName: filename,
      mimeType: 'image/png', fileSize: PNG.length, filePath, name: label,
    },
  });
  return asset.id;
}

const embed = (id: string) => `![Picture](/api/assets/maps/${id})`;

/** A handout the GM wrote in the campaign, through the app. */
async function written(content: string): Promise<{ id: string; filePath: string }> {
  const res = await gm.post('/api/assets/documents').send({ name: 'Handout', format: 'md', content, scope: 'CAMPAIGN', campaignId });
  expect(res.status).toBe(201);
  const { filePath } = await prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id }, select: { filePath: true } });
  return { id: res.body.asset.id, filePath };
}

/** A handout of the GM's in the campaign stored before what documents name was kept: a row and a file, and nothing else. */
async function storedBefore(content: string): Promise<string> {
  const filename = `before-${Date.now()}-${Math.random()}.md`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, content);
  const doc = await prisma.asset.create({
    data: {
      type: 'DOCUMENT', scope: 'CAMPAIGN', campaignId, uploadedById: user.gm, filename, originalName: filename,
      mimeType: 'text/markdown', fileSize: Buffer.byteLength(content), filePath, name: filename,
    },
  });
  return doc.id;
}

async function listedToPlayer(): Promise<Set<string>> {
  const res = await player.get('/api/assets').query({ campaignId, limit: '100' });
  expect(res.status).toBe(200);
  return new Set((res.body.assets as Array<{ id: string }>).map((a) => a.id));
}

/** How many document files of the campaign's are opened while `run` runs. */
async function documentFilesOpenedBy(run: () => Promise<unknown>): Promise<number> {
  const docs = await prisma.asset.findMany({ where: { campaignId, type: 'DOCUMENT' }, select: { filePath: true } });
  const files = new Set(docs.map((d) => path.resolve(d.filePath)));
  const realOpen = fs.promises.open.bind(fs.promises);
  let opened = 0;
  const spy = jest.spyOn(fs.promises, 'open').mockImplementation((file, ...rest) => {
    if (files.has(path.resolve(String(file)))) opened += 1;
    return realOpen(file, ...rest);
  });
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
  return opened;
}

beforeAll(async () => {
  const stamp = Date.now();
  const [d, p] = await Promise.all((['gm', 'player'] as const).map((who) =>
    createTestUser({ email: `doc-pictures-${who}-${stamp}@test.cozyvtt.local`, displayName: `Doc pictures ${who}` })));
  [user.gm, user.player] = [d.id, p.id];
  campaignId = (await createTestCampaign(user.gm, { name: `Doc pictures ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: user.gm, campaignId, role: 'GM', characterIds: [] },
      { userId: user.player, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  gm = await login(d.email);
  player = await login(p.email);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers(Object.values(user));
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('a handout written in the campaign', () => {
  it('shows its picture to a player, and their list and read open no document file', async () => {
    const letter = await picture('letter');
    await written(`# From the Baron\n\n${embed(letter)}\n`);

    let listed = new Set<string>();
    const opened = await documentFilesOpenedBy(async () => {
      listed = await listedToPlayer();
      expect((await player.get(`/api/assets/maps/${letter}`)).status).toBe(200);
    });
    expect(listed.has(letter)).toBe(true);
    expect(opened).toBe(0);
  });

  it('shows what its text names after each save, and nothing it no longer names', async () => {
    const first = await picture('first');
    const second = await picture('second');
    const { id } = await written(embed(first));
    expect((await player.get(`/api/assets/maps/${first}`)).status).toBe(200);

    expect((await gm.put(`/api/assets/documents/${id}/content`).send({ content: `Now ${embed(second)}` })).status).toBe(200);
    expect((await player.get(`/api/assets/maps/${first}`)).status).toBe(404);
    expect((await player.get(`/api/assets/maps/${second}`)).status).toBe(200);
    const listed = await listedToPlayer();
    expect(listed.has(first)).toBe(false);
    expect(listed.has(second)).toBe(true);
  });
});

describe('a handout uploaded into the campaign', () => {
  it('shows the pictures its file names', async () => {
    const poster = await picture('poster');
    const res = await gm
      .post('/api/assets/upload')
      .field('type', 'DOCUMENT')
      .field('scope', 'CAMPAIGN')
      .field('campaignId', campaignId)
      .attach('file', Buffer.from(`Wanted: ${embed(poster)}\n`), { filename: 'wanted.md', contentType: 'text/markdown' });
    expect(res.status).toBe(201);
    expect((await player.get(`/api/assets/maps/${poster}`)).status).toBe(200);
    expect(await documentFilesOpenedBy(() => listedToPlayer())).toBe(0);
  });
});

describe('handouts stored before what they name was kept', () => {
  it('are read a few at a time by the requests, each once, until all are', async () => {
    const pictures: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const id = await picture(`old-${i}`);
      pictures.push(id);
      await storedBefore(`Handout ${i}: ${embed(id)}`);
    }

    const perRequest: number[] = [];
    for (let i = 0; i < 6; i += 1) perRequest.push(await documentFilesOpenedBy(() => listedToPlayer()));

    expect(Math.max(...perRequest)).toBeLessThanOrEqual(5);
    // Each read once at most: a suite in another process may read some.
    expect(perRequest.reduce((sum, n) => sum + n, 0)).toBeLessThanOrEqual(12);
    expect(perRequest.slice(-2)).toEqual([0, 0]);
    expect(await prisma.asset.count({ where: { campaignId, type: 'DOCUMENT', picturesReadAt: null } })).toBe(0);
    const listed = await listedToPlayer();
    for (const id of pictures) expect(listed.has(id)).toBe(true);
  });
});
