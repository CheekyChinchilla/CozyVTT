/**
 * A campaign's map picture, for a member who sits at more than one table or
 * reads a handout.
 *
 * The picture of a map is kept from a campaign's players until the table is
 * on a map using it. "The table" is any table the player sits at: a picture
 * on the current map of another of their campaigns shows to them as it does
 * to that campaign's other players, provided its uploader sits at that table
 * too. A picture the DM embedded in a document shared with the campaign
 * shows to its members, as the handout it is in does. Nothing else a
 * player can point at, such as a character's picture, opens it.
 *
 * The list and the read stay one rule: whatever the tables and the spirit
 * plane, a member is listed a picture exactly when it opens for them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-map-tables-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

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
import { toJson } from '../../utils/prisma-json';

const app = createTestApp();

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
    '789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
);

type Agent = ReturnType<typeof request.agent>;

/** The campaigns: A and B run by the DM, D run by the player, E by another DM. */
const camp = { a: '', b: '', d: '', e: '' };
const user = { dm: '', player: '', spectator: '', otherDm: '', deputy: '' };
let player: Agent;
let spectator: Agent;
let dm: Agent;

/** The fixture's pictures by what they are, and where each is filed. */
const ids = {
  aPic: '', aSpirit: '', aPrepPic: '',
  tavern: '', farTavern: '',
  handout: '', ownHandout: '', secretHandout: '', handoutElsewhere: '', playersHandout: '', deputysHandout: '',
  bPic: '', dPic: '', borrowed: '',
};
type Fixture = keyof typeof ids;
const ALL = Object.keys(ids) as Fixture[];
const maps = { aCurrent: '', aPrepared: '', bCurrent: '', bPrepared: '', dPrepared: '', dBorrowing: '', eCurrent: '' };
const docs: string[] = [];

async function login(email: string): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function picture(campaignId: string, uploadedById: string, label: string): Promise<string> {
  const filename = `${label}-${Date.now()}.png`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, PNG);
  const asset = await prisma.asset.create({
    data: {
      type: 'MAP', scope: 'CAMPAIGN', campaignId, uploadedById, filename, originalName: filename,
      mimeType: 'image/png', fileSize: PNG.length, filePath, name: label,
    },
  });
  return asset.id;
}

/**
 * A Markdown handout of the DM's: their own (`USER`), shared with
 * `sharedWith` when given, or written in a campaign (`CAMPAIGN`), which its
 * members read with no share.
 */
async function handout(text: string, where: { sharedWith?: string; writtenIn?: string }, uploadedById = user.dm): Promise<void> {
  const filename = `handout-${Date.now()}-${docs.length}.md`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, text);
  const doc = await prisma.asset.create({
    data: {
      type: 'DOCUMENT', scope: where.writtenIn ? 'CAMPAIGN' : 'USER', campaignId: where.writtenIn ?? null,
      uploadedById, filename, originalName: filename,
      mimeType: 'text/markdown', fileSize: Buffer.byteLength(text), filePath, name: filename,
    },
  });
  const sharedWith = where.sharedWith;
  docs.push(doc.id);
  if (sharedWith) await prisma.campaignDocument.create({ data: { campaignId: sharedWith, assetId: doc.id, linkedById: user.dm } });
}

const mapPath = (id: string) => `/api/assets/maps/${id}`;

async function makeMap(campaignId: string, name: string, image: string, spirit?: string): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name, imageUrl: mapPath(image), baseLayerUrl: mapPath(image), spiritLayerUrl: spirit ? mapPath(spirit) : null,
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
    },
  });
  return map.id;
}

beforeAll(async () => {
  const stamp = Date.now();
  const made = await Promise.all((['dm', 'player', 'spectator', 'otherDm', 'deputy'] as const).map((who) =>
    createTestUser({ email: `tables-${who}-${stamp}@test.cozyvtt.local`, displayName: `Tables ${who}` })));
  [user.dm, user.player, user.spectator, user.otherDm, user.deputy] = made.map((u) => u.id);
  camp.a = (await createTestCampaign(user.dm, { name: `Tables A ${stamp}` })).id;
  camp.b = (await createTestCampaign(user.dm, { name: `Tables B ${stamp}` })).id;
  camp.d = (await createTestCampaign(user.player, { name: `Tables D ${stamp}` })).id;
  camp.e = (await createTestCampaign(user.otherDm, { name: `Tables E ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: user.dm, campaignId: camp.a, role: 'DM', characterIds: [] },
      { userId: user.player, campaignId: camp.a, role: 'PLAYER', characterIds: [] },
      { userId: user.spectator, campaignId: camp.a, role: 'SPECTATOR', characterIds: [] },
      { userId: user.deputy, campaignId: camp.a, role: 'PLAYER', characterIds: [] },
      { userId: user.dm, campaignId: camp.b, role: 'DM', characterIds: [] },
      { userId: user.player, campaignId: camp.b, role: 'PLAYER', characterIds: [] },
      { userId: user.player, campaignId: camp.d, role: 'DM', characterIds: [] },
      // A's DM sits at the player's table D too, so their pictures could count there.
      { userId: user.dm, campaignId: camp.d, role: 'PLAYER', characterIds: [] },
      { userId: user.otherDm, campaignId: camp.e, role: 'DM', characterIds: [] },
      { userId: user.player, campaignId: camp.e, role: 'PLAYER', characterIds: [] },
    ],
  });

  ids.aPic = await picture(camp.a, user.dm, 'a-current');
  ids.aSpirit = await picture(camp.a, user.dm, 'a-spirit');
  ids.aPrepPic = await picture(camp.a, user.dm, 'a-prepared');
  // Filed in A, and the picture of B's current map: the same DM runs both.
  ids.tavern = await picture(camp.a, user.dm, 'tavern');
  // Filed in A, and the picture of E's current map, whose table the DM is not at.
  ids.farTavern = await picture(camp.a, user.dm, 'far-tavern');
  ids.handout = await picture(camp.a, user.dm, 'letter-scan');
  ids.ownHandout = await picture(camp.a, user.dm, 'wanted-poster');
  ids.secretHandout = await picture(camp.a, user.dm, 'unsent-letter');
  ids.handoutElsewhere = await picture(camp.a, user.dm, 'other-letter');
  ids.playersHandout = await picture(camp.a, user.dm, 'copied-map');
  ids.deputysHandout = await picture(camp.a, user.dm, 'deputy-letter');
  ids.bPic = await picture(camp.b, user.dm, 'b-prepared');
  ids.dPic = await picture(camp.d, user.player, 'd-prepared');
  // Filed in A, and put by the player on a map of their own table D, which D is not on.
  ids.borrowed = await picture(camp.a, user.dm, 'borrowed');

  maps.aCurrent = await makeMap(camp.a, 'A now', ids.aPic, ids.aSpirit);
  maps.aPrepared = await makeMap(camp.a, 'A later', ids.aPrepPic);
  maps.bCurrent = await makeMap(camp.b, 'B now', ids.tavern);
  maps.bPrepared = await makeMap(camp.b, 'B later', ids.bPic);
  maps.dPrepared = await makeMap(camp.d, 'D later', ids.dPic);
  maps.dBorrowing = await makeMap(camp.d, 'D with a borrowed picture', ids.borrowed);
  maps.eCurrent = await makeMap(camp.e, 'E now', ids.farTavern);
  await prisma.campaign.update({ where: { id: camp.a }, data: { currentMapId: maps.aCurrent, spiritLayerEnabled: true } });
  await prisma.campaign.update({ where: { id: camp.b }, data: { currentMapId: maps.bCurrent } });
  await prisma.campaign.update({ where: { id: camp.e }, data: { currentMapId: maps.eCurrent } });

  await handout(`# From the Baron\n\n![The letter](/api/assets/maps/${ids.handout})\n`, { sharedWith: camp.a });
  await handout(`Wanted: ![poster](/api/assets/maps/${ids.ownHandout}).`, { writtenIn: camp.a });
  await handout(`Not yet: ![later](/api/assets/maps/${ids.secretHandout})`, {});
  await handout(`![elsewhere](/api/assets/maps/${ids.handoutElsewhere})`, { sharedWith: camp.b });
  // A campaign document of a member who is not the DM: one a former DM
  // wrote, or a player got in by any way. Theirs, not the DM's, to show.
  await handout(`I kept this: ![copy](/api/assets/maps/${ids.playersHandout})`, { writtenIn: camp.a }, user.player);
  // Written by the member the DM seat will be handed to.
  await handout(`![mine](/api/assets/maps/${ids.deputysHandout})`, { writtenIn: camp.a }, user.deputy);

  const emails = made.map((u) => u.email);
  dm = await login(emails[0]);
  player = await login(emails[1]);
  spectator = await login(emails[2]);
});

afterAll(async () => {
  const campaigns = Object.values(camp);
  for (const id of campaigns) await prisma.campaign.update({ where: { id }, data: { currentMapId: null } });
  await prisma.campaignDocument.deleteMany({ where: { campaignId: { in: campaigns } } });
  await prisma.map.deleteMany({ where: { campaignId: { in: campaigns } } });
  await prisma.asset.deleteMany({ where: { OR: [{ campaignId: { in: campaigns } }, { id: { in: docs } }] } });
  await cleanupCampaigns(campaigns);
  await cleanupUsers(Object.values(user));
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

async function listed(agent: Agent, query: Record<string, string>): Promise<Set<Fixture>> {
  const res = await agent.get('/api/assets').query({ limit: '100', ...query });
  expect(res.status).toBe(200);
  const got = new Set((res.body.assets as Array<{ id: string }>).map((a) => a.id));
  return new Set(ALL.filter((name) => got.has(ids[name])));
}

/** What a member is listed, which must be the same with no campaign named as over the campaigns one at a time. */
async function listings(agent: Agent, campaigns: string[]): Promise<Fixture[]> {
  const everywhere = await listed(agent, {});
  const usable = await listed(agent, { usable: 'true' });
  const each = new Set<Fixture>();
  for (const campaignId of campaigns) for (const name of await listed(agent, { campaignId })) each.add(name);
  expect([...everywhere].sort()).toEqual([...each].sort());
  expect([...usable].sort()).toEqual([...each].sort());
  return [...everywhere].sort();
}

async function readable(agent: Agent): Promise<Fixture[]> {
  const open: Fixture[] = [];
  for (const name of ALL) {
    const res = await agent.get(`/api/assets/${ids[name]}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) open.push(name);
  }
  return open.sort();
}

const PLAYER_SEES: Fixture[] = ['aPic', 'aSpirit', 'tavern', 'handout', 'ownHandout', 'dPic'];
const SPECTATOR_SEES: Fixture[] = ['aPic', 'aSpirit', 'handout', 'ownHandout'];

describe('a player at more than one table', () => {
  it("is shown a picture another table of theirs is on, when its uploader sits there too", async () => {
    expect(await readable(player)).toContain('tavern');
    expect((await player.get(`/api/assets/maps/${ids.tavern}`)).status).toBe(200);
    expect(await listings(player, [camp.a, camp.b, camp.d, camp.e])).toContain('tavern');
  });

  it('is not shown one whose uploader is not at the table that is on it', async () => {
    expect(await readable(player)).not.toContain('farTavern');
    expect((await player.get(`/api/assets/maps/${ids.farTavern}`)).status).toBe(404);
  });

  it('keeps nothing by putting a picture on a map of a table they run that the table is not on', async () => {
    expect(await readable(player)).not.toContain('borrowed');
    expect((await player.get(`/api/assets/maps/${ids.borrowed}`)).status).toBe(404);
    // Once D's table is on that map, it shows there as on any table's map.
    await prisma.campaign.update({ where: { id: camp.d }, data: { currentMapId: maps.dBorrowing } });
    try {
      expect((await player.get(`/api/assets/maps/${ids.borrowed}`)).status).toBe(200);
      expect(await listings(player, [camp.a, camp.b, camp.d, camp.e])).toEqual(await readable(player));
    } finally {
      await prisma.campaign.update({ where: { id: camp.d }, data: { currentMapId: null } });
    }
  });

  it("does not pass that on to someone at only the picture's own table", async () => {
    expect(await readable(spectator)).not.toContain('tavern');
  });
});

describe('a picture in a handout', () => {
  it('shows to the members of the campaign the handout is shared with, or written in', async () => {
    for (const agent of [player, spectator]) {
      expect((await agent.get(`/api/assets/maps/${ids.handout}`)).status).toBe(200);
      expect((await agent.get(`/api/assets/maps/${ids.ownHandout}`)).status).toBe(200);
      expect(await readable(agent)).toEqual(expect.arrayContaining(['handout', 'ownHandout']));
    }
  });

  it('stays hidden in a handout not shared, or shared with another campaign', async () => {
    for (const agent of [player, spectator]) {
      expect((await agent.get(`/api/assets/maps/${ids.secretHandout}`)).status).toBe(404);
      expect((await agent.get(`/api/assets/maps/${ids.handoutElsewhere}`)).status).toBe(404);
    }
  });

  it("stays hidden in a campaign document of anyone but the campaign's DM", async () => {
    for (const agent of [player, spectator]) {
      expect((await agent.get(`/api/assets/maps/${ids.playersHandout}`)).status).toBe(404);
      expect((await agent.get(`/api/assets/maps/${ids.deputysHandout}`)).status).toBe(404);
    }
  });

  it('follows the DM seat: the new DM\'s handouts show, the former DM\'s no longer do', async () => {
    const seat = (who: string, role: 'DM' | 'PLAYER') =>
      prisma.campaignMembership.update({ where: { userId_campaignId: { userId: who, campaignId: camp.a } }, data: { role } });
    await seat(user.dm, 'PLAYER');
    await seat(user.deputy, 'DM');
    try {
      expect((await spectator.get(`/api/assets/maps/${ids.deputysHandout}`)).status).toBe(200);
      expect((await spectator.get(`/api/assets/maps/${ids.handout}`)).status).toBe(404);
      expect((await spectator.get(`/api/assets/maps/${ids.ownHandout}`)).status).toBe(404);
      expect(await listings(spectator, [camp.a])).toEqual(await readable(spectator));
    } finally {
      await seat(user.deputy, 'PLAYER');
      await seat(user.dm, 'DM');
    }
  });

  it('follows the handout when the DM saves its text', async () => {
    const { assetId } = await prisma.campaignDocument.findFirstOrThrow({ where: { campaignId: camp.a }, select: { assetId: true } });
    const save = async (content: string) =>
      expect((await dm.put(`/api/assets/documents/${assetId}/content`).send({ content })).status).toBe(200);
    try {
      await save('# From the Baron\n\nThe letter is gone.\n');
      expect((await player.get(`/api/assets/maps/${ids.handout}`)).status).toBe(404);
    } finally {
      await save(`# From the Baron\n\n![The letter](/api/assets/maps/${ids.handout})\n`);
    }
    expect((await player.get(`/api/assets/maps/${ids.handout}`)).status).toBe(200);
  });
});

describe('a member is listed a picture exactly when it opens for them', () => {
  async function sweep() {
    expect(await listings(player, [camp.a, camp.b, camp.d, camp.e])).toEqual(await readable(player));
    expect(await listings(spectator, [camp.a])).toEqual(await readable(spectator));
  }

  it('with the spirit plane open to everyone', async () => {
    await sweep();
    expect(await readable(player)).toEqual([...PLAYER_SEES].sort());
    expect(await readable(spectator)).toEqual([...SPECTATOR_SEES].sort());
  });

  it('with the spirit plane closed', async () => {
    await prisma.campaign.update({ where: { id: camp.a }, data: { spiritLayerEnabled: false } });
    try {
      await sweep();
      expect(await readable(player)).not.toContain('aSpirit');
    } finally {
      await prisma.campaign.update({ where: { id: camp.a }, data: { spiritLayerEnabled: true } });
    }
  });

  it('with the plane closed and the player crossed over by their own token', async () => {
    await prisma.campaign.update({ where: { id: camp.a }, data: { spiritLayerEnabled: false } });
    await prisma.map.update({
      where: { id: maps.aCurrent },
      data: {
        tokens: toJson([{
          id: 'ghost', name: 'Ghost', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 },
          layer: 'spirit', visible: true, controlledBy: user.player, rotation: 0, conditions: [], metadata: {},
        }]),
      },
    });
    try {
      await sweep();
      expect(await readable(player)).toContain('aSpirit');
      expect(await readable(spectator)).not.toContain('aSpirit');
    } finally {
      await prisma.map.update({ where: { id: maps.aCurrent }, data: { tokens: [] } });
      await prisma.campaign.update({ where: { id: camp.a }, data: { spiritLayerEnabled: true } });
    }
  });
});
