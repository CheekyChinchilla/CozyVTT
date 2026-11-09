/**
 * A creature's temporary hit points, as Temporary HP... on its token's menu
 * changes them: through the token update route, whose rule they follow.
 *
 * A creature's hit points are its token's, and only the DM changes a token's
 * hit points, its temporary ones included: a player, even one the token names
 * as its controller, is refused. A character's token carries no hit points of
 * its own; its menu grants the character's (character.hp.temporary). A token
 * holds at most 99,999 temporary hit points, the most a grant may give.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { readTokens, toJson } from '../../utils/prisma-json';
import { MAX_TEMPORARY_HIT_POINTS } from '../../utils/rules/hitPoints';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;

const WOLF = randomUUID();
const hp = (temp: number) => ({ current: 11, max: 11, temp });

beforeAll(async () => {
  const dmUser = await createTestUser({ displayName: 'Temp HP DM' });
  const playerUser = await createTestUser({ displayName: 'Temp HP Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Temp HP tokens' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  // A wolf the DM has handed to the player, as a companion.
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Woods', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: toJson([{
        id: WOLF, name: 'Wolf', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token',
        visible: true, rotation: 0, conditions: [], metadata: {}, type: 'npc', controlledBy: playerId, hp: hp(0), showHpBar: true,
      }]),
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  dm = request.agent(app);
  player = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  expect((await player.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

const tokenUrl = () => `/api/campaigns/${campaignId}/maps/${mapId}/tokens/${WOLF}`;
const storedHp = async () =>
  readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens).find((t) => t.id === WOLF)?.hp;

describe("a creature token's temporary hit points", () => {
  it('are the DM to change', async () => {
    const res = await dm.put(tokenUrl()).send({ hp: hp(7) });
    expect(res.status).toBe(200);
    expect(await storedHp()).toEqual(hp(7));
  });

  it('are refused to a player, even the one the token names as its controller', async () => {
    const res = await player.put(tokenUrl()).send({ hp: hp(30) });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Only DM can update token field: hp');
    expect((await storedHp())?.temp).not.toBe(30);
  });

  it(`hold at most ${MAX_TEMPORARY_HIT_POINTS.toLocaleString('en-US')}`, async () => {
    expect((await dm.put(tokenUrl()).send({ hp: hp(MAX_TEMPORARY_HIT_POINTS) })).status).toBe(200);
    const over = await dm.put(tokenUrl()).send({ hp: hp(MAX_TEMPORARY_HIT_POINTS + 1) });
    expect(over.status).toBe(400);
    expect((await storedHp())?.temp).toBe(MAX_TEMPORARY_HIT_POINTS);
  });
});
