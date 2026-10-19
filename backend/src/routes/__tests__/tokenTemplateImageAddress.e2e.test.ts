/**
 * A token template's picture address is read as every other route reads one.
 *
 * The template routes checked and stored the address as sent, where the
 * creature and character routes first make it an asset's address
 * (normalizeAssetUrl). So a template took an outside address, which the
 * library showed as a broken picture and Place on Map then refused, and the
 * app's bare asset ids were stored in a form no other route uses.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let dmId: string;
let campaignId: string;
let otherCampaignId: string;
let artId: string;
let dm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Template Address DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Templates' })).id;
  otherCampaignId = (await createTestCampaign(dmId, { name: 'Other templates' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: dmId, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
    ],
  });
  artId = (await prisma.asset.create({
    data: {
      type: 'TOKEN', scope: 'USER', uploadedById: dmId, filename: 'g.png', originalName: 'g.png', mimeType: 'image/png',
      fileSize: 1, filePath: '/nonexistent/g.png', name: 'Goblin',
    },
  })).id;
  dm = request.agent(app);
  await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
  await cleanupCampaigns([campaignId, otherCampaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

const templates = () => `/api/campaigns/${campaignId}/token-templates`;

describe.each([
  ['created', (imageUrl: string) => dm.post(templates()).send({ name: 'Goblin', imageUrl })],
  ['made from a token', (imageUrl: string) => dm.post(`${templates()}/from-token`).send({ name: 'Goblin', imageUrl })],
  ['changed', async (imageUrl: string) => {
    const made = await dm.post(templates()).send({ name: 'Goblin' });
    return dm.put(`${templates()}/${made.body.id}`).send({ imageUrl });
  }],
])('a template %s', (_label, send) => {
  it('refuses an outside address', async () => {
    const res = await send('https://example.com/goblin.png');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You do not have access to that image');
  });

  it('stores a bare asset id as the asset\'s address', async () => {
    const res = await send(artId);
    expect(res.status).toBeLessThan(300);
    expect(res.body.imageUrl).toBe(`/api/assets/tokens/${artId}`);
  });
});

it('gives a copy the address in full when the template holds a bare id', async () => {
  const old = await prisma.tokenTemplate.create({ data: { name: 'Old goblin', campaignId, imageUrl: artId } });
  const res = await dm.post(`${templates()}/${old.id}/copy-to/${otherCampaignId}`);
  expect(res.status).toBe(201);
  expect(res.body.imageUrl).toBe(`/api/assets/tokens/${artId}`);
});
