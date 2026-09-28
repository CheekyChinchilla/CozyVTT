/**
 * Deleting a campaign hands its asset library to the uploaders in the same
 * step as the delete.
 *
 * The campaign's assets become each uploader's personal assets, then the
 * campaign is deleted. Those were two separate writes: a delete that failed
 * after the first left a campaign that still existed with its library gone
 * personal, which its members could no longer open. And an upload into the
 * campaign that landed between the two was left as a campaign asset with no
 * campaign, which the permission check lets anyone read.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

jest.setTimeout(30000);

const app = createTestApp();
let ownerId: string;
let owner: ReturnType<typeof request.agent>;
const campaignIds: string[] = [];

const asset = (campaignId: string, name: string) =>
  prisma.asset.create({
    data: {
      type: 'MAP', scope: 'CAMPAIGN', uploadedById: ownerId, campaignId,
      filename: `${name}.png`, originalName: `${name}.png`, mimeType: 'image/png',
      fileSize: 1, filePath: `maps/${name}.png`, name, tags: [],
    },
  });

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `del-assets-${stamp}@test.cozyvtt.local`, displayName: 'Owner' });
  ownerId = user.id;
  owner = request.agent(app);
  expect((await owner.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: ownerId } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  await cleanupUsers([ownerId]);
  await prisma.$disconnect();
});

describe('DELETE /api/campaigns/:campaignId and the campaign library', () => {
  it('leaves the library as it was when the delete itself fails', async () => {
    const campaign = await createTestCampaign(ownerId, { name: `Undeletable ${Date.now()}` });
    campaignIds.push(campaign.id);
    const map = await asset(campaign.id, `kept-${campaign.id}`);

    // A delete that fails in the database, as a dropped connection or a lock
    // timeout would: a trigger refusing this one campaign's row.
    const fn = `test_refuse_delete_${campaign.id.replace(/-/g, '')}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id = '${campaign.id}' THEN RAISE EXCEPTION 'refused by the test'; END IF; RETURN OLD; END $$`
    );
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE DELETE ON "Campaign" FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      const res = await owner.delete(`/api/campaigns/${campaign.id}`);
      expect(res.status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON "Campaign"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    }

    expect(await prisma.campaign.findUnique({ where: { id: campaign.id } })).not.toBeNull();
    expect(await prisma.asset.findUnique({ where: { id: map.id }, select: { scope: true, campaignId: true } }))
      .toEqual({ scope: 'CAMPAIGN', campaignId: campaign.id });
  });

  it('turns an upload that lands while the delete runs into its uploader\'s own asset', async () => {
    const campaign = await createTestCampaign(ownerId, { name: `Racing ${Date.now()}` });
    campaignIds.push(campaign.id);

    let uploadedId = '';
    let pending: Promise<request.Response> | null = null;
    // The upload is written in a transaction held open until the delete is
    // waiting on it. The upload's check that the campaign exists holds a
    // lock on the campaign's row, so the delete cannot finish first.
    await prisma.$transaction(async (tx) => {
      uploadedId = (await tx.asset.create({
        data: {
          type: 'MAP', scope: 'CAMPAIGN', uploadedById: ownerId, campaignId: campaign.id,
          filename: 'late.png', originalName: 'late.png', mimeType: 'image/png',
          fileSize: 1, filePath: `maps/late-${campaign.id}.png`, name: 'late', tags: [],
        },
      })).id;
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;

      pending = owner.delete(`/api/campaigns/${campaign.id}`).then((res) => res);

      // Until the delete is waiting on this transaction's lock.
      for (let tries = 0; ; tries++) {
        const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
        if (n > 0) break;
        if (tries > 200) throw new Error('the delete never waited on the upload');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }, { timeout: 20000 });

    expect((await pending!).status).toBe(200);
    expect(await prisma.campaign.findUnique({ where: { id: campaign.id } })).toBeNull();
    // Not a campaign asset with no campaign, which anyone could read.
    expect(await prisma.asset.findUnique({ where: { id: uploadedId }, select: { scope: true, campaignId: true } }))
      .toEqual({ scope: 'USER', campaignId: null });
  });
});
