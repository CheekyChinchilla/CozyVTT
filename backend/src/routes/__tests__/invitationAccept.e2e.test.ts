/**
 * Accepting a campaign invitation — End-to-End Tests
 *
 * `POST /api/invitations/:id/accept` joins the campaign as a player and can
 * bring characters along. Three things were wrong with it:
 *
 * - The body had no schema. A `characterIds` that was not a list of ids
 *   (null, an object, numbers, a string) reached the database and answered
 *   500.
 * - The invitation was checked as pending before the transaction and marked
 *   accepted inside it without looking again, so a second accept sent at the
 *   same moment got as far as creating the membership a second time and
 *   answered 500.
 * - It let a Flexible character into a campaign with a game system, and any
 *   character into a Flexible campaign, where assigning a character to a
 *   campaign from the Characters page refuses both. It now applies the same
 *   rule.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import type { GameSystem } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

jest.setTimeout(30000);

const app = createTestApp();
let dmId: string;
let playerId: string;
let player: ReturnType<typeof request.agent>;
const campaignIds: string[] = [];

/** A new campaign of the given system, with a pending invitation for the player. */
async function invitation(gameSystem: GameSystem | null) {
  const campaign = await createTestCampaign(dmId, { name: `Accept ${Date.now()}`, gameSystem });
  campaignIds.push(campaign.id);
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId: campaign.id, role: 'DM', characterIds: [] } });
  const invite = await prisma.campaignInvitation.create({ data: { campaignId: campaign.id, userId: playerId } });
  return { campaignId: campaign.id, id: invite.id };
}

const character = (name: string, gameSystem: GameSystem | null) =>
  prisma.character.create({ data: { userId: playerId, name, gameSystem, data: {} } });

const accept = (id: string, body?: unknown) => {
  const req = player.post(`/api/invitations/${id}/accept`);
  return body === undefined ? req : req.send(body as object);
};

beforeAll(async () => {
  const stamp = Date.now();
  dmId = (await createTestUser({ email: `accept_dm_${stamp}@test.invalid` })).id;
  const playerUser = await createTestUser({ email: `accept_pl_${stamp}@test.invalid` });
  playerId = playerUser.id;
  player = request.agent(app);
  await player.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await cleanupCampaigns(campaignIds);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

describe('POST /api/invitations/:id/accept', () => {
  it.each([
    ['null', { characterIds: null }],
    ['an object', { characterIds: {} }],
    ['numbers', { characterIds: [1, 2] }],
    ['a string', { characterIds: 'abc' }],
    ['an empty id', { characterIds: [''] }],
    ['more than 50 ids', { characterIds: Array.from({ length: 51 }, (_, i) => `id-${i}`) }],
  ])('refuses characterIds given as %s with 400, and leaves the invitation pending', async (_what, body) => {
    const invite = await invitation('DND_5E');
    const res = await accept(invite.id, body);
    expect(res.status).toBe(400);
    expect((await prisma.campaignInvitation.findUnique({ where: { id: invite.id } }))?.status).toBe('PENDING');
    expect(await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId: playerId, campaignId: invite.campaignId } },
    })).toBeNull();
  });

  it('joins without characters when the body names none', async () => {
    const invite = await invitation('DND_5E');
    expect((await accept(invite.id)).status).toBe(200);
    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId: playerId, campaignId: invite.campaignId } },
    });
    expect(membership).toMatchObject({ role: 'PLAYER', characterIds: [] });
  });

  it('brings a character of the campaign\'s own game system', async () => {
    const invite = await invitation('DND_5E');
    const hero = await character('Matching hero', 'DND_5E');
    const res = await accept(invite.id, { characterIds: [hero.id] });
    expect(res.status).toBe(200);
    expect((await prisma.character.findUnique({ where: { id: hero.id } }))?.campaignId).toBe(invite.campaignId);
  });

  it.each([
    ['a Flexible character into a D&D 5e campaign', null, 'DND_5E'],
    ['a D&D 5e character into a Flexible campaign', 'DND_5E', null],
    ['a Pathfinder 2e character into a D&D 5e campaign', 'PATHFINDER_2E', 'DND_5E'],
  ] as const)('refuses %s, as assigning it would', async (_what, characterSystem, campaignSystem) => {
    const invite = await invitation(campaignSystem);
    const hero = await character('Mismatched hero', characterSystem);
    const res = await accept(invite.id, { characterIds: [hero.id] });
    expect(res.status).toBe(400);
    expect((await prisma.character.findUnique({ where: { id: hero.id } }))?.campaignId).toBeNull();
    expect((await prisma.campaignInvitation.findUnique({ where: { id: invite.id } }))?.status).toBe('PENDING');
  });

  it('accepts once when the same invitation is accepted several times at once', async () => {
    const invite = await invitation(null);
    const results = await Promise.all(Array.from({ length: 5 }, () => accept(invite.id, { characterIds: [] })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400, 400, 400, 400]);
    expect(await prisma.campaignMembership.count({ where: { userId: playerId, campaignId: invite.campaignId } })).toBe(1);
  });

  it('brings a character into only one campaign when two invitations are accepted with it at once', async () => {
    const first = await invitation(null);
    const second = await invitation(null);
    const hero = await character('Contested hero', null);
    const results = await Promise.all([
      accept(first.id, { characterIds: [hero.id] }),
      accept(second.id, { characterIds: [hero.id] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);

    // The campaign the character ended up in is the one whose membership lists it.
    const placed = (await prisma.character.findUnique({ where: { id: hero.id } }))?.campaignId;
    const listing = await prisma.campaignMembership.findMany({
      where: { userId: playerId, campaignId: { in: [first.campaignId, second.campaignId] }, characterIds: { has: hero.id } },
      select: { campaignId: true },
    });
    expect(listing).toEqual([{ campaignId: placed }]);
  });
});
