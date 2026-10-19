/**
 * A member's list of character ids stays right when changes overlap.
 *
 * Each character a member brings is listed in their membership's
 * `characterIds`, which the roster is built from. Creating a character into a
 * campaign, assigning one and taking one out each read that list and wrote it
 * back changed, so two changes close together lost one of them; an assign
 * that read the character's campaign before another assign moved it left the
 * character listed in both campaigns. Deleting a character, or creating one
 * straight into a campaign, also told the campaign nothing, and deleting left
 * its id in the list. Each change is now one statement on the list, inside a
 * transaction that holds the character, and both tell the campaign.
 *
 * The stale reads below stand for the other change landing between a route's
 * read and its write.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';

const broadcastToCampaign = jest.fn();
jest.mock('../../websocket/utils', () => ({
  ...jest.requireActual('../../websocket/utils'),
  broadcastToCampaign: (...args: unknown[]) => broadcastToCampaign(...args),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';

const app = createTestApp();

let playerId: string;
let campaignA: string;
let campaignB: string;
let player: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const [dm, p] = await Promise.all([createTestUser({ displayName: 'Lists DM' }), createTestUser({ displayName: 'Lists Player' })]);
  playerId = p.id;
  campaignA = (await createTestCampaign(dm.id, { name: 'Lists A', gameSystem: null })).id;
  campaignB = (await createTestCampaign(dm.id, { name: 'Lists B', gameSystem: null })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dm.id, campaignId: campaignA, role: 'DM', characterIds: [] },
      { userId: dm.id, campaignId: campaignB, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId: campaignA, role: 'PLAYER', characterIds: [] },
      { userId: playerId, campaignId: campaignB, role: 'PLAYER', characterIds: [] },
    ],
  });
  player = request.agent(app);
  await player.post('/api/auth/login').send({ email: p.email, password: TEST_PASSWORD }).expect(200);
});

beforeEach(async () => {
  broadcastToCampaign.mockClear();
  await prisma.character.deleteMany({ where: { userId: playerId } });
  await prisma.campaignMembership.updateMany({ where: { userId: playerId }, data: { characterIds: [] } });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { userId: playerId } });
  const owners = await prisma.campaign.findMany({ where: { id: { in: [campaignA, campaignB] } }, select: { ownerId: true } });
  await cleanupCampaigns([campaignA, campaignB]);
  await cleanupUsers([playerId, ...owners.map((o) => o.ownerId)]);
  await prisma.$disconnect();
});

const listOf = async (campaignId: string) =>
  (await prisma.campaignMembership.findUniqueOrThrow({ where: { userId_campaignId: { userId: playerId, campaignId } } })).characterIds;

/** A character of the player's, in `campaignId` (and its list) or in none. */
async function character(name: string, campaignId: string | null) {
  const created = await prisma.character.create({ data: { userId: playerId, name, gameSystem: null, data: {}, campaignId } });
  if (campaignId) {
    await prisma.campaignMembership.update({
      where: { userId_campaignId: { userId: playerId, campaignId } },
      data: { characterIds: { push: created.id } },
    });
  }
  return created.id;
}

/** Make the next reads of a membership return it with no characters listed. */
function staleMembershipRead() {
  const real = appPrisma.campaignMembership.findUnique.bind(appPrisma.campaignMembership);
  jest.spyOn(appPrisma.campaignMembership, 'findUnique').mockImplementation((async (args: never) => {
    const found = await real(args);
    return found ? { ...found, characterIds: [] } : found;
  }) as never);
}

it('keeps a listed character when another is created into the campaign', async () => {
  const kept = await character('Aldra', campaignA);
  staleMembershipRead();
  const res = await player.post('/api/characters').send({ name: 'Brann', campaignId: campaignA, data: {} });
  expect(res.status).toBe(201);
  expect((await listOf(campaignA)).sort()).toEqual([kept, res.body.character.id].sort());
});

it('keeps a listed character when another is assigned to the campaign', async () => {
  const kept = await character('Aldra', campaignA);
  const moving = await character('Brann', null);
  staleMembershipRead();
  expect((await player.post(`/api/characters/${moving}/assign`).send({ campaignId: campaignA })).status).toBe(200);
  expect((await listOf(campaignA)).sort()).toEqual([kept, moving].sort());
});

it('lists a character in one campaign only when it moved while being assigned', async () => {
  const moving = await character('Brann', campaignA);
  // The route reads the character as it was before another assign took it
  // into campaign A.
  const real = appPrisma.character.findUnique.bind(appPrisma.character);
  jest.spyOn(appPrisma.character, 'findUnique').mockImplementation((async (args: never) => {
    const found = await real(args);
    return found ? { ...found, campaignId: null } : found;
  }) as never);
  expect((await player.post(`/api/characters/${moving}/assign`).send({ campaignId: campaignB })).status).toBe(200);
  expect(await listOf(campaignA)).toEqual([]);
  expect(await listOf(campaignB)).toEqual([moving]);
});

it('takes a deleted character out of its campaign\'s list, and tells the campaign', async () => {
  const gone = await character('Aldra', campaignA);
  expect((await player.delete(`/api/characters/${gone}`)).status).toBe(200);
  expect(await listOf(campaignA)).toEqual([]);
  expect(broadcastToCampaign).toHaveBeenCalledWith(campaignA, 'roster.updated', expect.objectContaining({
    action: 'character.deleted', characterId: gone, userId: playerId, campaignId: campaignA,
  }));
});

it('tells the campaign about a character created straight into it', async () => {
  const res = await player.post('/api/characters').send({ name: 'Brann', campaignId: campaignA, data: {} });
  expect(res.status).toBe(201);
  expect(broadcastToCampaign).toHaveBeenCalledWith(campaignA, 'roster.updated', expect.objectContaining({
    action: 'character.assigned', characterId: res.body.character.id, userId: playerId, campaignId: campaignA,
  }));
});
