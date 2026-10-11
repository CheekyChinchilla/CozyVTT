/**
 * Universal VTT imports from different people wait their turn, and the queue
 * always moves on.
 *
 * A UVTT file can be over 50 MB, almost all of it the map picture, and the
 * import held the upload and its decoded picture in memory together. One
 * import at a time per user was the only bound, so three people importing at
 * once took the backend near its memory limit. The upload now waits on disk,
 * and the part that holds the picture in memory runs for one import at a
 * time across the server; the others queue behind it.
 *
 * One import that hung would have held every other import on the server, and
 * a request left waiting longer than the proxy's 60 seconds got a proxy error.
 * So an import that runs past its time limit is stopped, keeps nothing, and
 * the next one starts; one that cannot start soon enough is answered 503 with
 * the reason; and one whose client has gone is dropped without being read.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-uvtt-queue-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

/**
 * The thumbnail step, which every import passes through while it holds its
 * picture: how many imports are inside it at once, at most, and how many
 * have reached it. While `hold` is set, each import waits there for it.
 */
const thumbs: { now: number; most: number; calls: number; hold: Promise<void> | null } = {
  now: 0,
  most: 0,
  calls: 0,
  hold: null,
};
jest.mock('../../utils/thumbnails', () => ({
  generateThumbnail: jest.fn(async () => {
    thumbs.now += 1;
    thumbs.calls += 1;
    thumbs.most = Math.max(thumbs.most, thumbs.now);
    await (thumbs.hold ?? new Promise((resolve) => setTimeout(resolve, 150)));
    thumbs.now -= 1;
    return null;
  }),
}));

/** Short limits, so the waits can be seen in a test. */
jest.mock('../../services/uvttImportQueue', () => {
  const actual = jest.requireActual<typeof import('../../services/uvttImportQueue')>('../../services/uvttImportQueue');
  const { serialQueue } = jest.requireActual<typeof import('../../utils/serialQueue')>('../../utils/serialQueue');
  return { ...actual, uvttImportQueue: serialQueue({ timeLimitMs: 2500, maxWaitMs: 1000 }) };
});

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
// The time limit test waits out the 2.5-second limit set above.
jest.setTimeout(15_000);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const UVTT = Buffer.from(
  JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
    line_of_sight: [[{ x: 1, y: 1 }, { x: 2, y: 1 }]],
    portals: [],
    lights: [],
    image: PNG.toString('base64'),
  })
);

const users: string[] = [];
const campaigns: string[] = [];

async function dmWithCampaign(): Promise<{ agent: request.Agent; campaignId: string }> {
  const user = await createTestUser({ displayName: 'UVTT queue DM' });
  users.push(user.id);
  const campaignId = (await createTestCampaign(user.id)).id;
  campaigns.push(campaignId);
  await prisma.campaignMembership.create({ data: { userId: user.id, campaignId, role: 'DM', characterIds: [] } });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { agent, campaignId };
}

const importUvtt = (dm: { agent: request.Agent; campaignId: string }, file = UVTT) =>
  dm.agent.post(`/api/campaigns/${dm.campaignId}/maps/import-uvtt`).field('name', 'Queued Map').attach('file', file, 'queued.uvtt');

/** Every file under `dir`, or none when it does not exist. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  const walk = (at: string) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(full);
    }
  };
  walk(dir);
  return found;
}

/** Files left in the uploads folder's temporary area. */
const leftInTemp = () => filesUnder(path.join(UPLOAD_DIR, 'temp'));

/** A promise that settles only when `release` is called. */
function held(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

/** Wait until `check` is true, failing after five seconds. */
async function until(check: () => boolean | Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting until ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

afterAll(async () => {
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('POST /api/campaigns/:campaignId/maps/import-uvtt from several DMs at once', () => {
  it('imports every file, one at a time', async () => {
    const dms = [await dmWithCampaign(), await dmWithCampaign(), await dmWithCampaign()];
    thumbs.most = 0;

    const results = await Promise.all(dms.map((dm) => importUvtt(dm)));

    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(thumbs.most).toBe(1);
  });

  it('leaves no upload behind in the temporary folder, whether the import works or not', async () => {
    const dm = await dmWithCampaign();
    expect((await importUvtt(dm)).status).toBe(201);
    expect((await importUvtt(dm, Buffer.from('not json at all'))).status).toBe(400);

    expect(leftInTemp()).toEqual([]);
  });

  it('answers 503 to an import that cannot start soon enough, saying another import is running', async () => {
    const [running, waiting] = [await dmWithCampaign(), await dmWithCampaign()];
    const gate = held();
    thumbs.hold = gate.promise;
    const first = importUvtt(running).then((res) => res);
    await until(() => thumbs.now === 1, 'the first import is running');

    const second = await importUvtt(waiting);
    thumbs.hold = null;
    gate.release();

    expect(second.status).toBe(503);
    expect(second.body.message).toBe('Another map import is running on the server. Try again in a minute.');
    expect(second.headers['retry-after']).toBe('60');
    expect((await first).status).toBe(201);
    expect(await prisma.map.count({ where: { campaignId: waiting.campaignId } })).toBe(0);
  });

  it('stops an import that runs past its time limit, keeps nothing of it, and starts the next', async () => {
    const [hung, next] = [await dmWithCampaign(), await dmWithCampaign()];
    const gate = held();
    thumbs.hold = gate.promise;

    const first = await importUvtt(hung);
    expect(first.status).toBe(503);
    expect(first.body.message).toMatch(/^This map import took longer than \d+ seconds and was stopped, so nothing was saved\./);

    // The first is still stuck in its thumbnail, and the queue has moved on.
    thumbs.hold = null;
    expect((await importUvtt(next)).status).toBe(201);
    expect(thumbs.now).toBe(1);

    gate.release();
    const pictures = path.join(UPLOAD_DIR, 'maps', 'campaigns', hung.campaignId);
    await until(() => thumbs.now === 0 && filesUnder(pictures).length === 0, 'the stopped import has removed its picture');
    expect(await prisma.asset.count({ where: { campaignId: hung.campaignId } })).toBe(0);
    expect(await prisma.map.count({ where: { campaignId: hung.campaignId } })).toBe(0);
  });

  it('drops a waiting import whose client has gone, without reading it', async () => {
    const [running, gone] = [await dmWithCampaign(), await dmWithCampaign()];
    const gate = held();
    thumbs.hold = gate.promise;
    const first = importUvtt(running).then((res) => res);
    await until(() => thumbs.now === 1, 'the first import is running');
    const reached = thumbs.calls;

    await expect(importUvtt(gone).timeout(300)).rejects.toThrow();
    // Its upload is removed while the first import is still running.
    await until(() => leftInTemp().length === 0, 'the dropped upload is removed');

    thumbs.hold = null;
    gate.release();
    expect((await first).status).toBe(201);
    expect(thumbs.calls).toBe(reached);
    expect(await prisma.map.count({ where: { campaignId: gone.campaignId } })).toBe(0);
  });
});
