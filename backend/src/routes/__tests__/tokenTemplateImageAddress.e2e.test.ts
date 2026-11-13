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
let gmId: string;
let campaignId: string;
let otherCampaignId: string;
let artId: string;
let gm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Template Address GM' });
  gmId = user.id;
  campaignId = (await createTestCampaign(gmId, { name: 'Templates' })).id;
  otherCampaignId = (await createTestCampaign(gmId, { name: 'Other templates' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: gmId, campaignId: otherCampaignId, role: 'GM', characterIds: [] },
    ],
  });
  artId = (await prisma.asset.create({
    data: {
      type: 'TOKEN', scope: 'USER', uploadedById: gmId, filename: 'g.png', originalName: 'g.png', mimeType: 'image/png',
      fileSize: 1, filePath: '/nonexistent/g.png', name: 'Goblin',
    },
  })).id;
  gm = request.agent(app);
  await gm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: gmId } });
  await cleanupCampaigns([campaignId, otherCampaignId]);
  await cleanupUsers([gmId]);
  await prisma.$disconnect();
});

const templates = () => `/api/campaigns/${campaignId}/token-templates`;

describe.each([
  ['created', (imageUrl: string) => gm.post(templates()).send({ name: 'Goblin', imageUrl })],
  ['made from a token', (imageUrl: string) => gm.post(`${templates()}/from-token`).send({ name: 'Goblin', imageUrl })],
  ['changed', async (imageUrl: string) => {
    const made = await gm.post(templates()).send({ name: 'Goblin' });
    return gm.put(`${templates()}/${made.body.id}`).send({ imageUrl });
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
  const res = await gm.post(`${templates()}/${old.id}/copy-to/${otherCampaignId}`);
  expect(res.status).toBe(201);
  expect(res.body.imageUrl).toBe(`/api/assets/tokens/${artId}`);
});
