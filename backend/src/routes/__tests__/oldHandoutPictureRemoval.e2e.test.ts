/**
 * Deleting a campaign picture that a document stored before 1.6.0 shows,
 * as its uploader who does not run the campaign: end-to-end tests
 *
 * What a document shows is kept as it is written. The plain text and
 * Markdown documents stored before that were kept are read for it a few at
 * a time, as the table plays, and the check that keeps a former GM from
 * deleting a picture others use counted only those read so far. Just after
 * the upgrade, a former GM could delete with force a picture an older
 * handout of the new GM's still showed. Now the check reads the remaining
 * unread documents that could show it, up to MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL,
 * and refuses while any stay unread. The campaign's GM and an admin delete
 * as before, reading nothing.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';
import { MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL } from '../../services/sharedDocumentPictures';

const app = createTestApp();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-old-handouts-'));
// The documents are stored under paths relative to DIR, and the file runs
// from DIR. Jest runs other files at the same time against the same
// database, and a delete there reads unread documents of any campaign
// (assetUsage); from their folder these paths name nothing, so they leave
// this file's documents unread, as its tests need.
const startedIn = process.cwd();

type Agent = ReturnType<typeof request.agent>;

const UNREAD_REFUSAL = {
  delete: "Some older documents have not yet been checked for the pictures they show, so for now only the campaign's GM can delete this asset. Try again later.",
  move: "Some older documents have not yet been checked for the pictures they show, so for now only the campaign's GM can move this asset out of the campaign. Try again later.",
};
const USED_BY_OTHERS = "Others in the campaign use this asset, so only the campaign's GM can delete it";

const userIds: string[] = [];
const campaignIds: string[] = [];
let campaignId = '';
let otherCampaignId = '';
let newGmsOtherCampaignId = '';
const id = { newGm: '', formerGm: '', player: '', spectator: '', stranger: '', leaver: '' };
let adminUser: Agent;
let newGm: Agent;
let formerGm: Agent;
let player: Agent;
let spectator: Agent;
let stranger: Agent;

async function login(email: string): Promise<Agent> {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

/** A map picture the former GM uploaded into the campaign while they ran it. */
async function picture(): Promise<{ id: string; address: string }> {
  const filename = `picture-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const asset = await prisma.asset.create({
    data: {
      type: 'MAP', scope: 'CAMPAIGN', campaignId, uploadedById: id.formerGm, filename, originalName: filename,
      mimeType: 'image/png', fileSize: 1, filePath: path.join(DIR, filename), name: 'Old map',
    },
  });
  return { id: asset.id, address: `/api/assets/maps/${asset.id}` };
}

/**
 * A Markdown document stored before what documents show was kept: a row and
 * a file, and nothing read from it. By default a handout the new GM keeps in
 * the campaign; `by` is another writer, `personal` puts it in their own
 * library and `inCampaign` in another campaign. `missingFile` leaves the
 * file out, so it cannot be read.
 */
async function storedBefore(
  content: string,
  options: { missingFile?: boolean; by?: string; personal?: boolean; inCampaign?: string } = {}
): Promise<{ id: string; filePath: string }> {
  const filename = `before-${Date.now()}-${Math.random().toString(36).slice(2)}.md`;
  const filePath = filename;
  if (!options.missingFile) fs.writeFileSync(path.join(DIR, filename), content);
  const doc = await prisma.asset.create({
    data: {
      type: 'DOCUMENT',
      scope: options.personal ? 'USER' : 'CAMPAIGN',
      campaignId: options.personal ? null : options.inCampaign ?? campaignId,
      uploadedById: options.by ?? id.newGm, filename, originalName: filename,
      mimeType: 'text/markdown', fileSize: Buffer.byteLength(content), filePath, name: filename,
    },
  });
  return { id: doc.id, filePath };
}

const stillThere = async (assetId: string) =>
  prisma.asset.findUnique({ where: { id: assetId }, select: { scope: true, campaignId: true } });

/** How many of the given files are opened while `run` runs. */
async function filesOpenedBy(files: string[], run: () => Promise<unknown>): Promise<number> {
  const watched = new Set(files.map((file) => path.resolve(file)));
  const realOpen = fs.promises.open.bind(fs.promises);
  let opened = 0;
  const spy = jest.spyOn(fs.promises, 'open').mockImplementation((file, ...rest) => {
    if (watched.has(path.resolve(String(file)))) opened += 1;
    return realOpen(file, ...rest);
  });
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
  return opened;
}

/** Mark every unread document of this file's users as read, so one test's documents do not reach the next. */
async function settleUnread(): Promise<void> {
  await prisma.asset.updateMany({
    where: { uploadedById: { in: userIds }, type: 'DOCUMENT', picturesReadAt: null },
    data: { picturesReadAt: new Date() },
  });
}

beforeAll(async () => {
  process.chdir(DIR);
  const stamp = Date.now();
  const make = (who: string, role?: 'ADMIN') => createTestUser({ email: `old-handout-${who}-${stamp}@test.invalid`, role });
  const [admin, n, f, p, s, x, l] = await Promise.all([
    make('admin', 'ADMIN'), make('newdm'), make('formerdm'), make('player'), make('spectator'), make('stranger'), make('leaver'),
  ]);
  [id.newGm, id.formerGm, id.player, id.spectator, id.stranger, id.leaver] = [n.id, f.id, p.id, s.id, x.id, l.id];
  userIds.push(admin.id, n.id, f.id, p.id, s.id, x.id, l.id);

  campaignId = (await createTestCampaign(id.newGm, { name: `Handed over ${stamp}` })).id;
  otherCampaignId = (await createTestCampaign(id.stranger, { name: `Next door ${stamp}` })).id;
  newGmsOtherCampaignId = (await createTestCampaign(id.newGm, { name: `Their other table ${stamp}` })).id;
  campaignIds.push(campaignId, otherCampaignId, newGmsOtherCampaignId);
  // The seat has been handed over: the former GM now sits as a player.
  await prisma.campaignMembership.createMany({
    data: [
      { userId: id.newGm, campaignId, role: 'GM', characterIds: [] },
      { userId: id.formerGm, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: id.player, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: id.spectator, campaignId, role: 'SPECTATOR', characterIds: [] },
      { userId: id.stranger, campaignId: otherCampaignId, role: 'GM', characterIds: [] },
      { userId: id.newGm, campaignId: newGmsOtherCampaignId, role: 'GM', characterIds: [] },
    ],
  });

  adminUser = await login(admin.email);
  newGm = await login(n.email);
  formerGm = await login(f.email);
  player = await login(p.email);
  spectator = await login(s.email);
  stranger = await login(x.email);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await settleUnread();
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { OR: [{ campaignId: { in: campaignIds } }, { uploadedById: { in: userIds } }] } });
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
  process.chdir(startedIn);
  fs.rmSync(DIR, { recursive: true, force: true });
});

describe('a former GM, with an older handout of the new GM\'s showing their picture', () => {
  it('may not delete the picture, forced or not', async () => {
    const art = await picture();
    await storedBefore(`# The map they found\n\n![Map](${art.address})\n`);

    const forced = await formerGm.delete(`/api/assets/${art.id}?force=true`);
    expect(forced.status).toBe(403);
    expect(forced.body.message).toBe(USED_BY_OTHERS);
    expect((await formerGm.delete(`/api/assets/${art.id}`)).status).toBe(403);
    expect(await stillThere(art.id)).not.toBeNull();
  });

  it('may not move the picture out of the campaign', async () => {
    const art = await picture();
    await storedBefore(`![Map](${art.address})`);

    const res = await formerGm.patch(`/api/assets/${art.id}/scope`).send({ scope: 'USER' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Others in the campaign use this asset, so only the campaign's GM can move it out of the campaign");
    expect(await stillThere(art.id)).toEqual({ scope: 'CAMPAIGN', campaignId });
  });

  it('may delete a picture the older handouts do not show, once they are read', async () => {
    const art = await picture();
    const doc = await storedBefore('# Notes\n\nNo pictures here.\n');

    expect((await formerGm.delete(`/api/assets/${art.id}?force=true`)).status).toBe(200);
    expect(await stillThere(art.id)).toBeNull();
    const read = await prisma.asset.findUniqueOrThrow({ where: { id: doc.id }, select: { picturesReadAt: true } });
    expect(read.picturesReadAt).not.toBeNull();
  });

  it('is refused while an older handout cannot be read, and told why', async () => {
    const art = await picture();
    await storedBefore(`![Map](${art.address})`, { missingFile: true });

    const deleted = await formerGm.delete(`/api/assets/${art.id}?force=true`);
    expect(deleted.status).toBe(403);
    expect(deleted.body.message).toBe(UNREAD_REFUSAL.delete);
    const moved = await formerGm.patch(`/api/assets/${art.id}/scope`).send({ scope: 'USER' });
    expect(moved.status).toBe(403);
    expect(moved.body.message).toBe(UNREAD_REFUSAL.move);
    expect(await stillThere(art.id)).toEqual({ scope: 'CAMPAIGN', campaignId });
  });

  it(`reads at most ${MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL} older documents a delete, refusing while more are left`, async () => {
    const art = await picture();
    const docs: Array<{ id: string; filePath: string }> = [];
    for (let i = 0; i <= MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL; i += 1) docs.push(await storedBefore(`Handout ${i}, no pictures.`));
    const files = docs.map((doc) => doc.filePath);

    let first: request.Response | undefined;
    const openedFirst = await filesOpenedBy(files, async () => { first = await formerGm.delete(`/api/assets/${art.id}?force=true`); });
    expect(first?.status).toBe(403);
    expect(first?.body.message).toBe(UNREAD_REFUSAL.delete);
    expect(openedFirst).toBe(MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL);
    expect(await stillThere(art.id)).not.toBeNull();

    // The next try reads what is left.
    expect((await formerGm.delete(`/api/assets/${art.id}?force=true`)).status).toBe(200);
    expect(await prisma.asset.count({ where: { id: { in: docs.map((doc) => doc.id) }, picturesReadAt: null } })).toBe(0);
  });
});

describe('which older documents a former GM\'s delete reads', () => {
  it('reads a co-member\'s document in their own library, and is refused when it shows the picture', async () => {
    const art = await picture();
    const doc = await storedBefore(`![Map](${art.address})`, { personal: true });

    const res = await formerGm.delete(`/api/assets/${art.id}?force=true`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(USED_BY_OTHERS);
    const read = await prisma.asset.findUniqueOrThrow({ where: { id: doc.id }, select: { picturesReadAt: true } });
    expect(read.picturesReadAt).not.toBeNull();
  });

  it('reads a co-member\'s document in another campaign, and is refused when it shows the picture', async () => {
    const art = await picture();
    await storedBefore(`![Map](${art.address})`, { inCampaign: newGmsOtherCampaignId });

    const res = await formerGm.delete(`/api/assets/${art.id}?force=true`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(USED_BY_OTHERS);
  });

  it('leaves alone an unreadable document of their own, of a former member and of someone outside the campaign', async () => {
    const art = await picture();
    const docs = [
      await storedBefore(`![Map](${art.address})`, { missingFile: true, by: id.formerGm, personal: true }),
      await storedBefore(`![Map](${art.address})`, { missingFile: true, by: id.leaver, personal: true }),
      await storedBefore(`![Map](${art.address})`, { missingFile: true, by: id.stranger, inCampaign: otherCampaignId }),
    ];

    let status = 0;
    const opened = await filesOpenedBy(docs.map((doc) => doc.filePath), async () => {
      status = (await formerGm.delete(`/api/assets/${art.id}?force=true`)).status;
    });
    expect(status).toBe(200);
    expect(opened).toBe(0);
    expect(await stillThere(art.id)).toBeNull();
  });
});

describe('the campaign\'s GM and an admin, with an older handout showing the picture', () => {
  it('the GM deletes it with force as before, reading no document', async () => {
    const art = await picture();
    const doc = await storedBefore(`![Map](${art.address})`);

    let status = 0;
    const opened = await filesOpenedBy([doc.filePath], async () => { status = (await newGm.delete(`/api/assets/${art.id}?force=true`)).status; });
    expect(status).toBe(200);
    expect(opened).toBe(0);
    expect(await stillThere(art.id)).toBeNull();
  });

  it('the GM moves it to another campaign they run as before, reading no document', async () => {
    const art = await picture();
    const doc = await storedBefore(`![Map](${art.address})`);

    let status = 0;
    const opened = await filesOpenedBy([doc.filePath], async () => {
      status = (await newGm.patch(`/api/assets/${art.id}/scope`).send({ scope: 'CAMPAIGN', campaignId: newGmsOtherCampaignId })).status;
    });
    expect(status).toBe(200);
    expect(opened).toBe(0);
    expect(await stillThere(art.id)).toEqual({ scope: 'CAMPAIGN', campaignId: newGmsOtherCampaignId });
  });

  it('an admin deletes it with force as before, reading no document', async () => {
    const art = await picture();
    const doc = await storedBefore(`![Map](${art.address})`);

    let status = 0;
    const opened = await filesOpenedBy([doc.filePath], async () => { status = (await adminUser.delete(`/api/assets/${art.id}?force=true`)).status; });
    expect(status).toBe(200);
    expect(opened).toBe(0);
    expect(await stillThere(art.id)).toBeNull();
  });
});

describe('anyone else, with an older handout that cannot be read', () => {
  it('a player, a spectator, a member of another campaign and someone signed out may not delete the picture', async () => {
    const art = await picture();
    await storedBefore(`![Map](${art.address})`, { missingFile: true });

    expect((await player.delete(`/api/assets/${art.id}?force=true`)).status).toBe(404);
    expect((await spectator.delete(`/api/assets/${art.id}?force=true`)).status).toBe(404);
    expect((await stranger.delete(`/api/assets/${art.id}?force=true`)).status).toBe(404);
    expect((await request(app).delete(`/api/assets/${art.id}?force=true`)).status).toBe(401);
    expect(await stillThere(art.id)).not.toBeNull();
  });
});
