/**
 * A map being made current cannot be deleted from under it.
 *
 * Deleting a map checked whether it was the campaign's current map, then
 * deleted it, with nothing holding the campaign in between. A switch to that
 * map landing between the two was undone by the delete, which cleared the
 * campaign's current map: the table had no map at all. Making a map current
 * while it was being deleted answered 500. Both now hold the campaign's row:
 * the delete refuses the map that became current, and the switch answers 404
 * for a map that is gone.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Map Delete DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Map delete race' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

const newMap = async (name: string) =>
  (await prisma.map.create({
    data: { campaignId, name, imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  })).id;

/** Whether some other connection is waiting on a lock. */
const someoneWaits = async () =>
  (await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM pg_locks WHERE NOT granted`)[0].n > 0n;

it('refuses to delete a map that became current while the delete was on its way', async () => {
  const shown = await newMap('Shown');
  const next = await newMap('Next');
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shown } });

  let deleting: Promise<request.Response> | undefined;
  await prisma.$transaction(async (tx) => {
    // The switch to Next, not yet committed, as the delete arrives.
    await tx.campaign.update({ where: { id: campaignId }, data: { currentMapId: next } });
    deleting = dm.delete(`/api/campaigns/${campaignId}/maps/${next}`).then((r) => r);
    for (let i = 0; i < 50 && !(await someoneWaits()); i += 1) await new Promise((r) => setTimeout(r, 20));
  }, { timeout: 10_000 });

  const res = await deleting!;
  expect(res.status).toBe(400);
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  expect(campaign.currentMapId).toBe(next);
  expect(await prisma.map.findUnique({ where: { id: next } })).not.toBeNull();
});

it('answers 404 for making current a map deleted while the switch was on its way', async () => {
  const shown = await newMap('Shown again');
  const doomed = await newMap('Doomed');
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shown } });

  let switching: Promise<request.Response> | undefined;
  await prisma.$transaction(async (tx) => {
    // The campaign is held (as a delete holds it) while the map goes.
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
    switching = dm.put(`/api/campaigns/${campaignId}/maps/${doomed}/set-current`).then((r) => r);
    for (let i = 0; i < 50 && !(await someoneWaits()); i += 1) await new Promise((r) => setTimeout(r, 20));
    await tx.map.delete({ where: { id: doomed } });
  }, { timeout: 10_000 });

  const res = await switching!;
  expect(res.status).toBe(404);
  expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).currentMapId).toBe(shown);
});
