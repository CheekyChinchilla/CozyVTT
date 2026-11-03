/**
 * A campaign's map pictures are kept from its players until the table goes
 * there.
 *
 * Every member listed and opened every picture in the campaign's library, so
 * a player's Asset Library showed the picture of a map the DM was preparing
 * and every map picture uploaded ahead of time. A campaign picture a map uses
 * (its picture, base layer or spirit layer), and a map picture no map uses
 * yet, is now listed and opened for a player or a spectator only while the
 * table is on a map that shows it, and their own uploads always. The list and
 * the read are decided by one rule, so a picture is listed exactly when it
 * opens. Token pictures, the DM and the instance's administrators are
 * unchanged.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-map-pictures-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import request from 'supertest';
import { Client } from 'pg';

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

/** A tiny valid PNG, written to disk so the serving routes have something to send. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
    '789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
);

type Agent = ReturnType<typeof request.agent>;

let dmId: string;
let playerId: string;
let spectatorId: string;
let adminId: string;
let campaignId: string;
let dm: Agent;
let player: Agent;
let spectator: Agent;
let admin: Agent;

/** The fixture's assets by what they are. */
const ids = {
  villagePic: '',
  villageSpirit: '',
  cryptPic: '',
  cryptSpirit: '',
  towerBase: '',
  unusedMapPic: '',
  ownMapPic: '',
  tokenArt: '',
  unusedTokenArt: '',
  tokenAsMapPic: '',
};
type Fixture = keyof typeof ids;
const maps = { village: '', villageCopy: '', crypt: '', tower: '', oldHall: '' };

async function login(email: string): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function makeAsset(type: 'MAP' | 'TOKEN', uploadedById: string, label: string): Promise<string> {
  const filename = `${label}-${Date.now()}.png`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, PNG);
  const asset = await prisma.asset.create({
    data: {
      type, scope: 'CAMPAIGN', campaignId, uploadedById, filename, originalName: filename,
      mimeType: 'image/png', fileSize: PNG.length, filePath, name: label,
    },
  });
  return asset.id;
}

const mapPath = (id: string) => `/api/assets/maps/${id}`;
const tokenPath = (id: string) => `/api/assets/tokens/${id}`;

async function makeMap(name: string, layers: { image?: string; base?: string; spirit?: string }, tokens: unknown[] = []): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name,
      imageUrl: layers.image ?? '', baseLayerUrl: layers.base ?? layers.image ?? '',
      spiritLayerUrl: layers.spirit ?? null,
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: toJson(tokens),
    },
  });
  return map.id;
}

beforeAll(async () => {
  const stamp = Date.now();
  const [dmUser, playerUser, spectatorUser, adminUser] = await Promise.all([
    createTestUser({ email: `pictures-dm-${stamp}@test.cozyvtt.local`, displayName: 'Pictures DM' }),
    createTestUser({ email: `pictures-player-${stamp}@test.cozyvtt.local`, displayName: 'Pictures Player' }),
    createTestUser({ email: `pictures-spec-${stamp}@test.cozyvtt.local`, displayName: 'Pictures Spectator' }),
    createTestUser({ email: `pictures-admin-${stamp}@test.cozyvtt.local`, displayName: 'Pictures Admin', role: 'ADMIN' }),
  ]);
  dmId = dmUser.id;
  playerId = playerUser.id;
  spectatorId = spectatorUser.id;
  adminId = adminUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Pictures ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });

  ids.villagePic = await makeAsset('MAP', dmId, 'village');
  ids.villageSpirit = await makeAsset('MAP', dmId, 'village-spirit');
  ids.cryptPic = await makeAsset('MAP', dmId, 'crypt');
  ids.cryptSpirit = await makeAsset('MAP', dmId, 'crypt-spirit');
  ids.towerBase = await makeAsset('MAP', dmId, 'tower-base');
  ids.unusedMapPic = await makeAsset('MAP', dmId, 'next-week');
  // Uploaded while the player held the DM's seat, before handing it over.
  ids.ownMapPic = await makeAsset('MAP', playerId, 'from-my-time-as-dm');
  ids.tokenArt = await makeAsset('TOKEN', dmId, 'lich');
  ids.unusedTokenArt = await makeAsset('TOKEN', dmId, 'rat');
  // A map stored before a map's picture had to be a map asset.
  ids.tokenAsMapPic = await makeAsset('TOKEN', dmId, 'old-hall');

  maps.village = await makeMap('Village', { image: mapPath(ids.villagePic), spirit: mapPath(ids.villageSpirit) });
  // Duplicated from the village, so it shows the same picture.
  maps.villageCopy = await makeMap('Village at night', { image: mapPath(ids.villagePic) });
  maps.crypt = await makeMap('Crypt', { image: mapPath(ids.cryptPic), spirit: mapPath(ids.cryptSpirit) }, [
    { id: 'lich', name: 'Lich', imageUrl: tokenPath(ids.tokenArt), position: { x: 1, y: 1 }, size: { width: 1, height: 1 } },
  ]);
  maps.tower = await makeMap('Tower', { image: '', base: mapPath(ids.towerBase) });
  maps.oldHall = await makeMap('Old hall', { image: tokenPath(ids.tokenAsMapPic) });

  // The spirit plane open to everyone, so only the map decides.
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: maps.village, spiritLayerEnabled: true } });

  dm = await login(dmUser.email);
  player = await login(playerUser.email);
  spectator = await login(spectatorUser.email);
  admin = await login(adminUser.email);
});

afterAll(async () => {
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId, spectatorId, adminId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

const ALL = Object.keys(ids) as Fixture[];

async function listed(agent: Agent, query: Record<string, string>): Promise<Set<Fixture>> {
  const res = await agent.get('/api/assets').query({ limit: '100', ...query });
  expect(res.status).toBe(200);
  const got = new Set((res.body.assets as Array<{ id: string }>).map((a) => a.id));
  return new Set(ALL.filter((name) => got.has(ids[name])));
}

/** What each of the four listings gives this member, which must all agree. */
async function listings(agent: Agent): Promise<Set<Fixture>> {
  const inCampaign = await listed(agent, { campaignId });
  const everywhere = await listed(agent, {});
  const usable = await listed(agent, { usable: 'true' });
  const mapsOnly = await listed(agent, { campaignId, type: 'MAP' });
  expect([...everywhere].sort()).toEqual([...inCampaign].sort());
  expect([...usable].sort()).toEqual([...inCampaign].sort());
  expect([...mapsOnly].sort()).toEqual([...inCampaign].filter((name) => !name.toLowerCase().includes('token')).sort());
  return inCampaign;
}

/** Each fixture asset by whether its details answer 200 for this member. */
async function readable(agent: Agent): Promise<Set<Fixture>> {
  const open = new Set<Fixture>();
  for (const name of ALL) {
    const res = await agent.get(`/api/assets/${ids[name]}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) open.add(name);
  }
  return open;
}

/** Every file route answers the same for this asset, 200 or 404. */
async function filesAnswer(agent: Agent, name: Fixture, status: 200 | 404) {
  const id = ids[name];
  const dir = name.toLowerCase().includes('token') ? 'tokens' : 'maps';
  expect((await agent.get(`/api/assets/${dir}/${id}`)).status).toBe(status);
  expect((await agent.get(`/api/assets/${dir}/${id}/thumbnail`)).status).toBe(status);
  expect((await agent.get(`/api/assets/${id}/download`)).status).toBe(status);
}

async function setCurrent(mapId: string) {
  const res = await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/set-current`);
  expect(res.status).toBe(200);
}

const ON_THE_VILLAGE: Fixture[] = ['villagePic', 'villageSpirit', 'tokenArt', 'unusedTokenArt'];
const IN_THE_CRYPT: Fixture[] = ['cryptPic', 'cryptSpirit', 'tokenArt', 'unusedTokenArt'];

describe('while the table is on the village', () => {
  beforeAll(async () => setCurrent(maps.village));

  it("lists for a player only the village's pictures, the token art and their own upload", async () => {
    expect([...(await listings(player))].sort()).toEqual([...ON_THE_VILLAGE, 'ownMapPic'].sort());
  });

  it('lists for a spectator the same, less the upload that is not theirs', async () => {
    expect([...(await listings(spectator))].sort()).toEqual([...ON_THE_VILLAGE].sort());
  });

  it("opens none of the hidden pictures' files for a player or a spectator", async () => {
    for (const agent of [player, spectator]) {
      for (const name of ['cryptPic', 'cryptSpirit', 'towerBase', 'unusedMapPic', 'tokenAsMapPic'] as const) {
        await filesAnswer(agent, name, 404);
      }
      await filesAnswer(agent, 'villagePic', 200);
      await filesAnswer(agent, 'villageSpirit', 200);
      await filesAnswer(agent, 'tokenArt', 200);
    }
    await filesAnswer(player, 'ownMapPic', 200);
    await filesAnswer(spectator, 'ownMapPic', 404);
  });

  it('keeps the village spirit picture hidden while the spirit plane is closed to them', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: false } });
    try {
      expect(await listings(player)).not.toContain('villageSpirit');
      await filesAnswer(player, 'villageSpirit', 404);
      // Still the village's picture, on the table.
      await filesAnswer(player, 'villagePic', 200);
    } finally {
      await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: true } });
    }
  });

  it('lists and opens everything for the DM', async () => {
    expect([...(await listings(dm))].sort()).toEqual([...ALL].sort());
    for (const name of ALL) await filesAnswer(dm, name, 200);
  });
});

describe('once the table goes to the crypt', () => {
  beforeAll(async () => setCurrent(maps.crypt));
  afterAll(async () => setCurrent(maps.village));

  it("shows a player the crypt's pictures and takes the village's away", async () => {
    expect([...(await listings(player))].sort()).toEqual([...IN_THE_CRYPT, 'ownMapPic'].sort());
    await filesAnswer(player, 'cryptPic', 200);
    await filesAnswer(player, 'cryptSpirit', 200);
    await filesAnswer(player, 'villagePic', 404);
    await filesAnswer(player, 'villageSpirit', 404);
  });

  it('does the same for a spectator', async () => {
    expect([...(await listings(spectator))].sort()).toEqual([...IN_THE_CRYPT].sort());
    await filesAnswer(spectator, 'cryptPic', 200);
    await filesAnswer(spectator, 'villagePic', 404);
  });

  it('shows a picture two maps share while either is on the table', async () => {
    await setCurrent(maps.villageCopy);
    expect(await listings(player)).toContain('villagePic');
    await filesAnswer(player, 'villagePic', 200);
    await filesAnswer(player, 'villageSpirit', 404);
  });

  it("shows a map's base layer when the map is on the table, and an old map's token picture", async () => {
    await setCurrent(maps.tower);
    expect(await listings(player)).toContain('towerBase');
    await filesAnswer(player, 'towerBase', 200);
    await setCurrent(maps.oldHall);
    expect(await listings(player)).toContain('tokenAsMapPic');
    await filesAnswer(player, 'tokenAsMapPic', 200);
  });
});

describe('a player is listed a picture exactly when it opens for them', () => {
  for (const [label, mapKey] of [['village', 'village'], ['crypt', 'crypt'], ['tower', 'tower'], ['old hall', 'oldHall']] as const) {
    it(`with the table on the ${label}`, async () => {
      await setCurrent(maps[mapKey]);
      for (const agent of [player, spectator]) {
        expect([...(await listings(agent))].sort()).toEqual([...(await readable(agent))].sort());
      }
    });
  }
  afterAll(async () => setCurrent(maps.village));
});

// A player's asset list read every map of every campaign they sit in, to
// learn which pictures their tables show. It needs only each table's current
// map and the maps naming a campaign file that is not a map picture (a map
// picture is the rule's by its type), so a campaign of many maps costs no more.
describe('the asset list of a player in a campaign of many maps', () => {
  const extra: string[] = [];
  beforeAll(async () => {
    for (let i = 0; i < 12; i += 1) extra.push(await makeMap(`Side room ${i}`, { image: `/api/assets/maps/${ids.cryptPic}` }));
  });
  afterAll(async () => {
    await prisma.map.deleteMany({ where: { id: { in: extra } } });
  });

  it('reads only the current map and the maps naming a file that is not a map picture', async () => {
    const mapRows: number[] = [];
    const realQuery = Client.prototype.query;
    jest.spyOn(Client.prototype, 'query').mockImplementation(function (this: Client, ...args: unknown[]) {
      const [first] = args;
      const sql = typeof first === 'string' ? first : first && typeof first === 'object' && 'text' in first ? String(first.text) : '';
      const reading = /^\s*SELECT/i.test(sql) && /FROM "public"\."Map"/.test(sql);
      const done = args[args.length - 1];
      if (reading && typeof done === 'function') {
        // The driver passes a callback: count the rows it is handed.
        args[args.length - 1] = (err: unknown, result: { rows?: unknown[] } | undefined) => {
          if (!err) mapRows.push(result?.rows?.length ?? 0);
          return (done as (e: unknown, r: unknown) => unknown)(err, result);
        };
      }
      const answer = (realQuery as (...a: unknown[]) => unknown).apply(this, args);
      if (reading && answer instanceof Promise) {
        void answer.then((result: { rows?: unknown[] }) => mapRows.push(result.rows?.length ?? 0), () => undefined);
      }
      return answer;
    } as never);
    try {
      expect((await player.get('/api/assets').query({ campaignId, limit: '100' })).status).toBe(200);
    } finally {
      jest.restoreAllMocks();
    }
    // The village, the table's map, and the old hall, which names token art.
    expect(mapRows.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2);
  });
});

describe("an instance administrator who is not in the campaign", () => {
  it('still lists and opens every picture in the library', async () => {
    expect([...(await listed(admin, {}))].sort()).toEqual([...ALL].sort());
    expect([...(await listed(admin, { campaignId }))].sort()).toEqual([...ALL].sort());
    for (const name of ALL) await filesAnswer(admin, name, 200);
  });
});
