/**
 * A refused creature or token template says which field was refused.
 *
 * These routes answered with each problem's message alone, so a trait's
 * description over its limit came back as "Too big: expected string to have
 * <=5000 characters", with nothing to say which of a stat block's fields it
 * was. Each problem now starts with the field it is about, as a refused token
 * does.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let dmId: string;
let campaignId: string;
let creatureId: string;
let templateId: string;
let dm: ReturnType<typeof request.agent>;

const statBlock = {
  ac: 12, hpMax: 7, speed: '30 ft.', challengeRating: '1/4',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
};
/** A trait whose description is one character over the limit. */
const longTrait = { ...statBlock, traits: [{ name: 'Nimble Escape', description: 'x'.repeat(5001) }] };
/** Twenty traits each within the limits, together over 64 KB. */
const tooLarge = { ...statBlock, traits: Array.from({ length: 20 }, (_, i) => ({ name: `Trait ${i}`, description: 'x'.repeat(4000) })) };

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Refusal DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Stat block refusals' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  creatureId = (await dm.post(`/api/campaigns/${campaignId}/creatures`).send({ name: 'Goblin', statBlock }).expect(201)).body.id;
  templateId = (await dm.post(`/api/campaigns/${campaignId}/token-templates`).send({ name: 'Goblin', type: 'npc', statBlock }).expect(201)).body.id;
});

afterAll(async () => {
  await prisma.creatureTemplate.deleteMany({ where: { campaignId } });
  await prisma.tokenTemplate.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

/** Each route that takes a stat block, sending `statBlock` with what else it needs. */
const routes: Array<[string, (statBlock: object) => request.Test]> = [
  ['creating a creature', (block) => dm.post(`/api/campaigns/${campaignId}/creatures`).send({ name: 'Goblin Boss', statBlock: block })],
  ['changing a creature', (block) => dm.put(`/api/campaigns/${campaignId}/creatures/${creatureId}`).send({ statBlock: block })],
  ['creating a token template', (block) => dm.post(`/api/campaigns/${campaignId}/token-templates`).send({ name: 'Goblin Boss', type: 'npc', statBlock: block })],
  ['changing a token template', (block) => dm.put(`/api/campaigns/${campaignId}/token-templates/${templateId}`).send({ statBlock: block })],
  ['saving a token as a template', (block) => dm.post(`/api/campaigns/${campaignId}/token-templates/from-token`).send({ name: 'Goblin Boss', type: 'npc', statBlock: block })],
];

it.each(routes)('names a refused trait description when %s', async (_route, send) => {
  const res = await send(longTrait);
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/^statBlock\.traits\.0\.description: /);
});

it.each(routes)('says a stat block is over 64 KB when %s', async (_route, send) => {
  const res = await send(tooLarge);
  expect(res.status).toBe(400);
  expect(res.body.message).toBe('statBlock: Stat block is too large (64 KB maximum)');
});

it('names a refused name', async () => {
  const res = await dm.post(`/api/campaigns/${campaignId}/creatures`).send({ name: 'x'.repeat(201), statBlock });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/^name: /);
});
