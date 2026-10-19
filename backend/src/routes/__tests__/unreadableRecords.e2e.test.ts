/**
 * A record the caller may not read is answered as if it were not there.
 *
 * These routes answered 404 for an id that names nothing and 403 for one that
 * names someone else's record, so a caller could tell which ids are real.
 * Ids do get around (a token names its creature template, a shared map names
 * its picture). Each now answers an unreadable record exactly as a made-up
 * id: the same 404 and the same message. A record the caller may read but
 * not change keeps its 403, tested where each route is.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let caller: ReturnType<typeof request.agent>;
const users: string[] = [];
const campaigns: string[] = [];

/** The caller's own campaigns, and one belonging to someone else. */
let mine: string;
let alsoMine: string;
let theirs: string;
let ownCharacter: string;
let ownAsset: string;
/** Records in `theirs`, or another user's own. */
const other = { template: '', creature: '', character: '', personalAsset: '', mapAsset: '', tokenAsset: '', invitation: '', member: '' };
/** A campaign of theirs the caller plays in, and records the caller may read there but not change. */
const readable = { campaign: '', character: '', asset: '', srdCreature: '' };

beforeAll(async () => {
  const [me, them, invited] = await Promise.all([
    createTestUser({ displayName: 'Unreadable Caller' }),
    createTestUser({ displayName: 'Unreadable Owner' }),
    createTestUser({ displayName: 'Unreadable Invitee' }),
  ]);
  users.push(me.id, them.id, invited.id);
  other.member = them.id;

  mine = (await createTestCampaign(me.id, { name: 'Mine' })).id;
  alsoMine = (await createTestCampaign(me.id, { name: 'Also mine' })).id;
  theirs = (await createTestCampaign(them.id, { name: 'Theirs' })).id;
  campaigns.push(mine, alsoMine, theirs);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: me.id, campaignId: mine, role: 'DM', characterIds: [] },
      { userId: me.id, campaignId: alsoMine, role: 'DM', characterIds: [] },
      { userId: them.id, campaignId: theirs, role: 'DM', characterIds: [] },
    ],
  });

  other.template = (await prisma.tokenTemplate.create({ data: { name: 'Their template', campaignId: theirs } })).id;
  other.creature = (await prisma.creatureTemplate.create({
    data: { name: 'Their creature', source: 'custom', statBlock: {}, campaignId: theirs, createdById: them.id },
  })).id;
  other.character = (await prisma.character.create({ data: { userId: them.id, name: 'Their hero', gameSystem: null, data: {}, campaignId: theirs } })).id;
  ownCharacter = (await prisma.character.create({ data: { userId: me.id, name: 'My hero', gameSystem: null, data: {} } })).id;
  const asset = (type: 'MAP' | 'TOKEN', scope: 'USER' | 'CAMPAIGN', uploadedById: string, campaignId: string | null) =>
    prisma.asset.create({
      data: {
        type, scope, uploadedById, campaignId, filename: 'x.png', originalName: 'x.png', mimeType: 'image/png',
        fileSize: 1, filePath: '/nonexistent/x.png', name: 'Picture',
      },
    }).then((a) => a.id);
  other.personalAsset = await asset('TOKEN', 'USER', them.id, null);
  other.mapAsset = await asset('MAP', 'CAMPAIGN', them.id, theirs);
  other.tokenAsset = await asset('TOKEN', 'CAMPAIGN', them.id, theirs);
  ownAsset = await asset('TOKEN', 'USER', me.id, null);
  other.invitation = (await prisma.campaignInvitation.create({ data: { campaignId: theirs, userId: invited.id } })).id;

  readable.campaign = (await createTestCampaign(them.id, { name: 'Joined' })).id;
  campaigns.push(readable.campaign);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: them.id, campaignId: readable.campaign, role: 'DM', characterIds: [] },
      { userId: me.id, campaignId: readable.campaign, role: 'PLAYER', characterIds: [] },
    ],
  });
  readable.character = (await prisma.character.create({
    data: { userId: them.id, name: 'Their hero at my table', gameSystem: null, data: {}, campaignId: readable.campaign },
  })).id;
  readable.asset = await asset('TOKEN', 'CAMPAIGN', them.id, readable.campaign);
  readable.srdCreature = (await prisma.creatureTemplate.create({ data: { name: 'Goblin', source: 'srd', statBlock: {}, campaignId: null } })).id;

  caller = request.agent(app);
  await caller.post('/api/auth/login').send({ email: me.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { userId: { in: users } } });
  await prisma.asset.deleteMany({ where: { uploadedById: { in: users } } });
  await prisma.creatureTemplate.deleteMany({ where: { id: { in: [other.creature, readable.srdCreature] } } });
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

type Call = (id: string) => request.Test;

/** Each route, called with the id of a record the caller may not read. */
const routes: Array<[string, () => string, Call]> = [
  ['GET a token template', () => other.template, (id) => caller.get(`/api/campaigns/${mine}/token-templates/${id}`)],
  ['PUT a token template', () => other.template, (id) => caller.put(`/api/campaigns/${mine}/token-templates/${id}`).send({ name: 'Mine now' })],
  ['DELETE a token template', () => other.template, (id) => caller.delete(`/api/campaigns/${mine}/token-templates/${id}`)],
  ['copy a token template', () => other.template, (id) => caller.post(`/api/campaigns/${mine}/token-templates/${id}/copy-to/${alsoMine}`)],
  ['PUT a creature', () => other.creature, (id) => caller.put(`/api/campaigns/${mine}/creatures/${id}`).send({ name: 'Mine now' })],
  ['DELETE a creature', () => other.creature, (id) => caller.delete(`/api/campaigns/${mine}/creatures/${id}`)],
  ['GET a character', () => other.character, (id) => caller.get(`/api/characters/${id}`)],
  ['validate a character', () => other.character, (id) => caller.get(`/api/characters/${id}/validate`)],
  ['PUT a character', () => other.character, (id) => caller.put(`/api/characters/${id}`).send({ name: 'Mine now' })],
  ['DELETE a character', () => other.character, (id) => caller.delete(`/api/characters/${id}`)],
  ['assign a character', () => other.character, (id) => caller.post(`/api/characters/${id}/assign`).send({ campaignId: mine })],
  ['unassign a character', () => other.character, (id) => caller.post(`/api/characters/${id}/assign`).send({ campaignId: null })],
  ['copy a character', () => other.character, (id) => caller.post(`/api/characters/${id}/copy`)],
  ['create a character in a campaign', () => theirs, (id) => caller.post('/api/characters').send({ name: 'Hero', data: {}, campaignId: id })],
  ['assign a character to a campaign', () => theirs, (id) => caller.post(`/api/characters/${ownCharacter}/assign`).send({ campaignId: id })],
  ['GET an asset\'s details', () => other.personalAsset, (id) => caller.get(`/api/assets/${id}`)],
  ['GET a campaign asset\'s details', () => other.tokenAsset, (id) => caller.get(`/api/assets/${id}`)],
  ['DELETE an asset', () => other.personalAsset, (id) => caller.delete(`/api/assets/${id}`)],
  ['download an asset', () => other.tokenAsset, (id) => caller.get(`/api/assets/${id}/download`)],
  ['GET a map picture', () => other.mapAsset, (id) => caller.get(`/api/assets/maps/${id}`)],
  ['GET a token picture', () => other.tokenAsset, (id) => caller.get(`/api/assets/tokens/${id}`)],
  ['move an asset', () => other.personalAsset, (id) => caller.patch(`/api/assets/${id}/scope`).send({ scope: 'USER' })],
  ['move an asset into a campaign', () => theirs, (id) => caller.patch(`/api/assets/${ownAsset}/scope`).send({ scope: 'CAMPAIGN', campaignId: id })],
  ['hand over a campaign\'s DM seat', () => theirs, (id) => caller.put(`/api/campaigns/${id}/dm`).send({ userId: other.member })],
  ['accept an invitation', () => other.invitation, (id) => caller.post(`/api/invitations/${id}/accept`).send({ characterIds: [] })],
  ['decline an invitation', () => other.invitation, (id) => caller.post(`/api/invitations/${id}/decline`)],
];

it.each(routes)('%s answers as for an id that names nothing', async (_label, real, call) => {
  const missing = await call(randomUUID());
  const unreadable = await call(real());
  expect(missing.status).toBe(404);
  expect({ status: unreadable.status, body: unreadable.body }).toEqual({ status: missing.status, body: missing.body });
});

it('leaves every record as it was', async () => {
  expect(await prisma.tokenTemplate.findUnique({ where: { id: other.template } })).toMatchObject({ name: 'Their template', campaignId: theirs });
  expect(await prisma.creatureTemplate.findUnique({ where: { id: other.creature } })).toMatchObject({ name: 'Their creature' });
  expect(await prisma.character.findUnique({ where: { id: other.character } })).toMatchObject({ name: 'Their hero', campaignId: theirs });
  expect(await prisma.asset.findUnique({ where: { id: other.personalAsset } })).toMatchObject({ scope: 'USER' });
  expect(await prisma.asset.findUnique({ where: { id: ownAsset } })).toMatchObject({ scope: 'USER', campaignId: null });
  expect(await prisma.campaignInvitation.findUnique({ where: { id: other.invitation } })).toMatchObject({ status: 'PENDING' });
  expect((await prisma.campaignMembership.findFirst({ where: { campaignId: theirs, role: 'DM' } }))?.userId).toBe(other.member);
});

describe('a record the caller may read but not change', () => {
  const refusals: Array<[string, () => request.Test]> = [
    ['validating a fellow player\'s character', () => caller.get(`/api/characters/${readable.character}/validate`)],
    ['deleting a fellow player\'s character', () => caller.delete(`/api/characters/${readable.character}`)],
    ['copying a fellow player\'s character', () => caller.post(`/api/characters/${readable.character}/copy`)],
    ['deleting the DM\'s campaign asset', () => caller.delete(`/api/assets/${readable.asset}`)],
    ['handing over the DM seat as a player', () => caller.put(`/api/campaigns/${readable.campaign}/dm`).send({ userId: other.member })],
    ['editing an SRD creature', () => caller.put(`/api/campaigns/${mine}/creatures/${readable.srdCreature}`).send({ name: 'Mine now' })],
    ['deleting an SRD creature', () => caller.delete(`/api/campaigns/${mine}/creatures/${readable.srdCreature}`)],
  ];

  it('can be read', async () => {
    expect((await caller.get(`/api/characters/${readable.character}`)).status).toBe(200);
    expect((await caller.get(`/api/assets/${readable.asset}`)).status).toBe(200);
  });

  it.each(refusals)('is still refused with 403: %s', async (_label, call) => {
    expect((await call()).status).toBe(403);
  });
});
