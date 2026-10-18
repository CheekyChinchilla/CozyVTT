/**
 * The DM of a character's campaign may take it out of that campaign.
 *
 * The DM was offered Remove from Campaign on every character, as the DM guide
 * says, but the server let only the character's owner do it, so the DM was
 * refused. Now the DM of the campaign the character is in may take it out;
 * the character stays with its owner, who can bring it to another campaign.
 * Only the owner may assign a character to a campaign, and a DM may not take
 * a character out of a campaign they do not run.
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

const app = createTestApp();

let dmId: string;
let playerId: string;
let otherPlayerId: string;
let otherDmId: string;
let campaignId: string;
let otherCampaignId: string;
let characterId: string;
const agents: Record<string, ReturnType<typeof request.agent>> = {};

const login = async (name: string, email: string) => {
  agents[name] = request.agent(app);
  await agents[name].post('/api/auth/login').send({ email, password: TEST_PASSWORD }).expect(200);
};

beforeAll(async () => {
  const [dm, player, otherPlayer, otherDm] = await Promise.all(['DM', 'Player', 'Other player', 'Other DM'].map((displayName) => createTestUser({ displayName })));
  [dmId, playerId, otherPlayerId, otherDmId] = [dm.id, player.id, otherPlayer.id, otherDm.id];
  campaignId = (await createTestCampaign(dmId, { name: 'DM removes' })).id;
  otherCampaignId = (await createTestCampaign(otherDmId, { name: 'Elsewhere' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherPlayerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherDmId, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
    ],
  });
  for (const [name, user] of [['dm', dm], ['player', player], ['otherPlayer', otherPlayer], ['otherDm', otherDm]] as const) {
    await login(name, user.email);
  }
});

beforeEach(async () => {
  broadcastToCampaign.mockClear();
  await prisma.character.deleteMany({ where: { userId: playerId } });
  characterId = (await prisma.character.create({ data: { userId: playerId, campaignId, name: 'Aldra', gameSystem: null, data: {} } })).id;
  await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId } }, data: { characterIds: [characterId] } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { userId: playerId } });
  await cleanupCampaigns([campaignId, otherCampaignId]);
  await cleanupUsers([dmId, playerId, otherPlayerId, otherDmId]);
  await prisma.$disconnect();
});

const unassign = (who: string) => agents[who].post(`/api/characters/${characterId}/assign`).send({ campaignId: null });

it('lets the DM of its campaign take a character out, leaving it with its owner', async () => {
  const res = await unassign('dm');

  expect(res.status).toBe(200);
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  expect(character).toMatchObject({ campaignId: null, userId: playerId });
  const membership = await prisma.campaignMembership.findUniqueOrThrow({ where: { userId_campaignId: { userId: playerId, campaignId } } });
  expect(membership.characterIds).toEqual([]);
  expect(broadcastToCampaign).toHaveBeenCalledWith(campaignId, 'roster.updated', expect.objectContaining({
    action: 'character.unassigned', characterId, userId: playerId, campaignId,
  }));
});

it.each([
  ['another player of the campaign', 'otherPlayer'],
  ['the DM of another campaign', 'otherDm'],
])('refuses %s', async (_who, agent) => {
  expect((await unassign(agent)).status).toBe(403);
  expect((await prisma.character.findUniqueOrThrow({ where: { id: characterId } })).campaignId).toBe(campaignId);
});

// A character still naming a campaign its owner has left is its owner's
// alone, as the read and edit routes already decide: that DM may not take
// it out, nor read the sheet in the answer.
it('refuses the DM a character whose owner has left the campaign', async () => {
  await prisma.campaignMembership.delete({ where: { userId_campaignId: { userId: playerId, campaignId } } });
  try {
    const res = await unassign('dm');
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
    expect((await prisma.character.findUniqueOrThrow({ where: { id: characterId } })).campaignId).toBe(campaignId);
  } finally {
    await prisma.campaignMembership.create({ data: { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] } });
  }
});

it('still lets only the owner assign a character to a campaign', async () => {
  await prisma.character.update({ where: { id: characterId }, data: { campaignId: null } });
  const res = await agents.dm.post(`/api/characters/${characterId}/assign`).send({ campaignId });
  expect(res.status).toBe(403);
});
