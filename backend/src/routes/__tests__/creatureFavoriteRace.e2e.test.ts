/**
 * Clicking a creature's favourite star twice quickly answers, either way.
 *
 * The toggle read whether the creature was a favourite, then added or
 * removed it. Two clicks close together could both read the same answer:
 * the second add hit the one-favourite rule and the second remove found
 * nothing to remove, each logged as a server error and answered 500. Each
 * write now leaves the state it means whatever the other did.
 *
 * The stale reads below stand for the other click landing between the read
 * and the write.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';

const app = createTestApp();

let dmId: string;
let campaignId: string;
let creatureId: string;
let dm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Favourite DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Favourites' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  creatureId = (await prisma.creatureTemplate.create({
    data: { campaignId, createdById: dmId, name: 'Rat', source: 'custom', statBlock: { ac: 12, speed: '30 ft.', abilities: { str: 2, dex: 11, con: 9, int: 2, wis: 10, cha: 4 } } },
  })).id;
  dm = request.agent(app);
  await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

beforeEach(async () => {
  await prisma.creatureFavorite.deleteMany({ where: { campaignId } });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.creatureFavorite.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

const toggle = () => dm.post(`/api/campaigns/${campaignId}/creatures/${creatureId}/favorite`);
const isFavourite = async () => (await prisma.creatureFavorite.count({ where: { campaignId, userId: dmId, creatureId } })) === 1;

it('adds a favourite another click added a moment before', async () => {
  await prisma.creatureFavorite.create({ data: { id: crypto.randomUUID(), campaignId, userId: dmId, creatureId } });
  jest.spyOn(appPrisma.creatureFavorite, 'findUnique').mockResolvedValueOnce(null);
  const res = await toggle();
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ favorited: true });
  expect(await isFavourite()).toBe(true);
});

it('removes a favourite another click removed a moment before', async () => {
  jest.spyOn(appPrisma.creatureFavorite, 'findUnique').mockResolvedValueOnce(
    { id: crypto.randomUUID(), campaignId, userId: dmId, creatureId, createdAt: new Date() } as never
  );
  const res = await toggle();
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ favorited: false });
  expect(await isFavourite()).toBe(false);
});
