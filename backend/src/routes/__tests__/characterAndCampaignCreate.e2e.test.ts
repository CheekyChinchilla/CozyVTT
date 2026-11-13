/**
 * Listing, deleting and copying characters, and creating and listing
 * campaigns: the owner's actions, and that nobody else can take them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

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

const app = createTestApp();
const users: string[] = [];
const campaigns: string[] = [];

let ownerId: string;
let otherId: string;
let owner: request.Agent;
let other: request.Agent;

async function signIn(email: string): Promise<request.Agent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function character(userId: string, name = 'Ser Testalot', campaignId: string | null = null) {
  return prisma.character.create({
    data: { userId, name, gameSystem: null, data: { notes: 'kept' }, tokenImageUrl: null, campaignId },
  });
}

beforeAll(async () => {
  const o = await createTestUser({ displayName: 'Character owner' });
  const x = await createTestUser({ displayName: 'Someone else' });
  ownerId = o.id;
  otherId = x.id;
  users.push(ownerId, otherId);
  owner = await signIn(o.email);
  other = await signIn(x.email);
});

afterAll(async () => {
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

describe('GET /api/characters', () => {
  it('lists the caller\'s characters and nobody else\'s', async () => {
    const mine = await character(ownerId, 'Mine');
    const theirs = await character(otherId, 'Theirs');

    const res = await owner.get('/api/characters');

    expect(res.status).toBe(200);
    const ids = (res.body.characters as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });

  it('refuses a caller who is not signed in', async () => {
    expect((await request(app).get('/api/characters')).status).toBe(401);
  });
});

describe('DELETE /api/characters/:id', () => {
  it('deletes the owner\'s character', async () => {
    const doomed = await character(ownerId);
    expect((await owner.delete(`/api/characters/${doomed.id}`)).status).toBe(200);
    expect(await prisma.character.findUnique({ where: { id: doomed.id } })).toBeNull();
  });

  it('refuses anyone else, and keeps the character', async () => {
    const kept = await character(ownerId);
    expect((await other.delete(`/api/characters/${kept.id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/characters/${kept.id}`)).status).toBe(401);
    expect(await prisma.character.findUnique({ where: { id: kept.id } })).not.toBeNull();
  });

  it('answers 404 for a character that is not there', async () => {
    expect((await owner.delete('/api/characters/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('POST /api/characters/:id/copy', () => {
  it('gives the owner an unassigned copy with the same sheet', async () => {
    const campaign = await createTestCampaign(ownerId);
    campaigns.push(campaign.id);
    const original = await character(ownerId, 'Original', campaign.id);

    const res = await owner.post(`/api/characters/${original.id}/copy`);

    expect(res.status).toBe(201);
    const copy = res.body.character as { id: string; name: string; userId: string; campaignId: string | null; data: unknown };
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Original (Copy)');
    expect(copy.userId).toBe(ownerId);
    expect(copy.campaignId).toBeNull();
    expect(copy.data).toEqual({ notes: 'kept' });
  });

  it('refuses anyone else, and makes no copy', async () => {
    const original = await character(ownerId, 'Not for copying');
    const before = await prisma.character.count({ where: { userId: otherId } });

    expect((await other.post(`/api/characters/${original.id}/copy`)).status).toBe(404);
    expect((await request(app).post(`/api/characters/${original.id}/copy`)).status).toBe(401);

    expect(await prisma.character.count({ where: { userId: otherId } })).toBe(before);
  });

  it('answers 404 for a character that is not there', async () => {
    expect((await owner.post('/api/characters/00000000-0000-4000-8000-000000000000/copy')).status).toBe(404);
  });
});

describe('POST /api/characters into a campaign', () => {
  async function campaignOwnedBy(userId: string, gameSystem: 'FIFTH_EDITION' | null) {
    const made = await createTestCampaign(userId, { gameSystem });
    campaigns.push(made.id);
    await prisma.campaignMembership.create({ data: { userId, campaignId: made.id, role: 'GM', characterIds: [] } });
    return made.id;
  }

  it('refuses a game system the campaign does not play, as assigning does', async () => {
    const fifthEdition = await campaignOwnedBy(ownerId, 'FIFTH_EDITION');
    const flexible = await campaignOwnedBy(ownerId, null);

    const intoFifthEdition = await owner.post('/api/characters').send({ name: 'Tobin', gameSystem: 'FANTASY_D20', campaignId: fifthEdition, data: {} });
    expect(intoFifthEdition.status).toBe(400);
    expect(intoFifthEdition.body).toEqual({
      error: 'Game System Mismatch',
      message: 'Cannot assign a FANTASY_D20 character to a FIFTH_EDITION campaign. Character and campaign game systems must match.',
    });

    const intoFlexible = await owner.post('/api/characters').send({ name: 'Tobin', gameSystem: 'FIFTH_EDITION', campaignId: flexible, data: {} });
    expect(intoFlexible.status).toBe(400);
    expect(intoFlexible.body.message).toBe(
      'Cannot assign a FIFTH_EDITION character to a flexible campaign. Character and campaign game systems must match.',
    );

    expect(await prisma.character.count({ where: { userId: ownerId, name: 'Tobin' } })).toBe(0);
  });
});

describe('POST /api/characters with a game system that does not exist', () => {
  it('answers 400 from the body check, and creates nothing', async () => {
    const res = await owner.post('/api/characters').send({ name: 'Nobody', gameSystem: 'NOT_A_SYSTEM', data: {} });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message: 'CozyVTT does not support that game system.' });
    expect(await prisma.character.count({ where: { userId: ownerId, name: 'Nobody' } })).toBe(0);
  });
});

describe('POST /api/campaigns', () => {
  it('creates the campaign with the caller as its owner and GM', async () => {
    const res = await owner.post('/api/campaigns').send({ name: '  The Lantern Road  ', gameSystem: 'FIFTH_EDITION' });

    expect(res.status).toBe(201);
    const made = res.body.campaign as { id: string; name: string; ownerId: string; gameSystem: string };
    campaigns.push(made.id);
    expect(made.name).toBe('The Lantern Road');
    expect(made.ownerId).toBe(ownerId);
    expect(made.gameSystem).toBe('FIFTH_EDITION');
    const membership = await prisma.campaignMembership.findUniqueOrThrow({
      where: { userId_campaignId: { userId: ownerId, campaignId: made.id } },
    });
    expect(membership.role).toBe('GM');
    // Member-facing answers never carry email addresses.
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  it('refuses a campaign with no name, a name over 200 characters, or an unknown game system', async () => {
    const before = await prisma.campaign.count({ where: { ownerId } });
    expect((await owner.post('/api/campaigns').send({ name: '   ' })).status).toBe(400);
    expect((await owner.post('/api/campaigns').send({ name: 'x'.repeat(201) })).status).toBe(400);
    expect((await owner.post('/api/campaigns').send({ name: 'Odd', gameSystem: 'MONOPOLY' })).status).toBe(400);
    expect(await prisma.campaign.count({ where: { ownerId } })).toBe(before);
  });

  it('refuses a caller who is not signed in', async () => {
    expect((await request(app).post('/api/campaigns').send({ name: 'Anonymous' })).status).toBe(401);
  });
});

describe('GET /api/campaigns', () => {
  it('lists the campaigns the caller belongs to, with their role, and no email addresses', async () => {
    const mine = await createTestCampaign(ownerId);
    const theirs = await createTestCampaign(otherId);
    campaigns.push(mine.id, theirs.id);
    await prisma.campaignMembership.create({
      data: { userId: ownerId, campaignId: mine.id, role: 'GM', characterIds: [] },
    });
    await prisma.campaignMembership.create({
      data: { userId: otherId, campaignId: theirs.id, role: 'GM', characterIds: [] },
    });

    const res = await owner.get('/api/campaigns');

    expect(res.status).toBe(200);
    const listed = res.body.campaigns as Array<{ id: string; userRole: string }>;
    expect(listed.find((c) => c.id === mine.id)?.userRole).toBe('GM');
    expect(listed.map((c) => c.id)).not.toContain(theirs.id);
    expect(JSON.stringify(res.body)).not.toMatch(/"email"/);
  });

  it('refuses a caller who is not signed in', async () => {
    expect((await request(app).get('/api/campaigns')).status).toBe(401);
  });
});
