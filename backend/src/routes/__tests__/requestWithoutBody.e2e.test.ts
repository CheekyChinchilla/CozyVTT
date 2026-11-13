/**
 * A POST or PUT sent with no body is answered as one with an empty body.
 *
 * Many handlers read their fields straight off the request body. Express 4's
 * JSON parser left an empty object there when nothing was sent; Express 5's
 * leaves nothing, so the same request crashed the handler and answered 500
 * where it used to say which field was missing. The body parsers now put the
 * empty object back.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let gmId: string;
let campaignId: string;
let gm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Bodiless GM' });
  gmId = user.id;
  campaignId = (await createTestCampaign(gmId, { name: 'No body' })).id;
  await prisma.campaignMembership.create({ data: { userId: gmId, campaignId, role: 'GM', characterIds: [] } });
  gm = request.agent(app);
  expect((await gm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([gmId]);
  await prisma.$disconnect();
});

it('says a new map needs a name when a POST has no body', async () => {
  const res = await gm.post(`/api/campaigns/${campaignId}/maps`);

  expect(res.status).toBe(400);
  expect(res.body.message).toBe('Map name is required');
});

it('says the vibe settings are missing when a PUT has no body', async () => {
  const res = await gm.put(`/api/campaigns/${campaignId}/vibe`);

  expect(res.status).toBe(400);
  expect(res.body.message).toBe('vibeSettings is required');
});

it('treats a body sent as something other than JSON as empty', async () => {
  const res = await gm.post(`/api/campaigns/${campaignId}/maps`).set('Content-Type', 'text/plain').send('name=Cellar');

  expect(res.status).toBe(400);
  expect(res.body.message).toBe('Map name is required');
});
