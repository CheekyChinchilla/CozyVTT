/**
 * Deleting an account works whatever the account has done.
 *
 * The database refused to delete a user who had rolled a die, uploaded a
 * file or owned a campaign, and both the self-service and the admin delete
 * answered 500. Dice rolls and uploads now stay, with no owner, as chat
 * messages already do; a campaign the person owns passes to whoever sits as
 * its DM, and one they run themselves has to be handed over or deleted first.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const userIds: string[] = [];
const campaignIds: string[] = [];

async function member(label: string, role?: PlatformRole) {
  const user = await createTestUser({ displayName: label, ...(role && { role }) });
  userIds.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

async function campaignRunBy(ownerId: string, dmId: string, others: string[] = []) {
  const campaign = await createTestCampaign(ownerId, { name: `Deletion ${randomUUID().slice(0, 6)}` });
  campaignIds.push(campaign.id);
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId: campaign.id, role: 'DM', characterIds: [] },
      ...[ownerId, ...others].filter((id) => id !== dmId).map((userId) => ({ userId, campaignId: campaign.id, role: 'PLAYER' as const, characterIds: [] })),
    ],
  });
  return campaign.id;
}

const upload = (uploadedById: string, campaignId: string | null) =>
  prisma.asset.create({
    data: {
      type: 'TOKEN', scope: campaignId ? 'CAMPAIGN' : 'USER', campaignId, uploadedById,
      filename: `${randomUUID()}.png`, originalName: 'art.png', mimeType: 'image/png', fileSize: 1,
      filePath: `/nonexistent/${randomUUID()}.png`, name: 'Art',
    },
  });

const roll = (userId: string, campaignId: string) =>
  prisma.diceRoll.create({ data: { campaignId, userId, expression: '1d20', result: 12, breakdown: {} } });

afterAll(async () => {
  await prisma.diceRoll.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.asset.deleteMany({ where: { OR: [{ campaignId: { in: campaignIds } }, { uploadedById: { in: userIds } }] } });
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

it('deletes a player who has rolled and uploaded, keeping the rolls and files with no owner', async () => {
  const dm = await member('Deletion DM');
  const leaver = await member('Deletion Player');
  const campaignId = await campaignRunBy(dm.user.id, dm.user.id, [leaver.user.id]);
  const rolled = await roll(leaver.user.id, campaignId);
  const campaignArt = await upload(leaver.user.id, campaignId);
  const personal = await upload(leaver.user.id, null);

  const res = await leaver.agent.delete('/api/auth/account').send({ password: TEST_PASSWORD });
  expect(res.status).toBe(200);

  expect(await prisma.user.findUnique({ where: { id: leaver.user.id } })).toBeNull();
  expect((await prisma.diceRoll.findUniqueOrThrow({ where: { id: rolled.id } })).userId).toBeNull();
  expect((await prisma.asset.findUniqueOrThrow({ where: { id: campaignArt.id } })).uploadedById).toBeNull();
  expect((await prisma.asset.findUniqueOrThrow({ where: { id: personal.id } })).uploadedById).toBeNull();
});

it('lets an admin delete such a user too', async () => {
  const admin = await member('Deletion Admin', PlatformRole.ADMIN);
  const dm = await member('Deletion DM 2');
  const target = await member('Deletion Target');
  const campaignId = await campaignRunBy(dm.user.id, dm.user.id, [target.user.id]);
  await roll(target.user.id, campaignId);

  expect((await admin.agent.delete(`/api/users/${target.user.id}`)).status).toBe(200);
  expect(await prisma.user.findUnique({ where: { id: target.user.id } })).toBeNull();
});

it('passes a campaign the person owns to the DM running it', async () => {
  const owner = await member('Deletion Owner');
  const runner = await member('Deletion Runner');
  const campaignId = await campaignRunBy(owner.user.id, runner.user.id);

  expect((await owner.agent.delete('/api/auth/account').send({ password: TEST_PASSWORD })).status).toBe(200);
  expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).ownerId).toBe(runner.user.id);
});

it('refuses while the person runs a campaign of their own, and changes nothing', async () => {
  const owner = await member('Deletion Sole DM');
  const player = await member('Deletion Their Player');
  const campaignId = await campaignRunBy(owner.user.id, owner.user.id, [player.user.id]);
  const name = (await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).name;

  const res = await owner.agent.delete('/api/auth/account').send({ password: TEST_PASSWORD });
  expect(res.status).toBe(409);
  expect(res.body.message).toContain(name);
  expect(await prisma.user.findUnique({ where: { id: owner.user.id } })).not.toBeNull();
});

// An admin has to be able to remove an account that will not step down: a
// user who runs their own campaigns cannot otherwise keep their account by
// refusing to hand them over. The refusal lists each campaign in the way and
// who else is in it; the admin hands the DM seat over or deletes the campaign.
describe('an admin deleting a user who runs their own campaigns', () => {
  it('is told which campaigns and members, and can then clear the way', async () => {
    const admin = await member('Deletion Admin 2', PlatformRole.ADMIN);
    const stubborn = await member('Deletion Stubborn DM');
    const heir = await member('Deletion Heir');
    const shared = await campaignRunBy(stubborn.user.id, stubborn.user.id, [heir.user.id]);
    const solo = await campaignRunBy(stubborn.user.id, stubborn.user.id);

    const refused = await admin.agent.delete(`/api/users/${stubborn.user.id}`);
    expect(refused.status).toBe(409);
    const blocking = refused.body.campaigns as Array<{ id: string; members: Array<{ userId: string; displayName: string }> }>;
    expect(blocking.map((c) => c.id).sort()).toEqual([shared, solo].sort());
    expect(blocking.find((c) => c.id === shared)?.members).toEqual([
      { userId: heir.user.id, displayName: 'Deletion Heir', role: 'PLAYER' },
    ]);
    expect(blocking.find((c) => c.id === solo)?.members).toEqual([]);

    expect((await admin.agent.put(`/api/campaigns/${shared}/dm`).send({ userId: heir.user.id })).status).toBe(200);
    expect((await admin.agent.delete(`/api/campaigns/${solo}`)).status).toBe(200);

    expect((await admin.agent.delete(`/api/users/${stubborn.user.id}`)).status).toBe(200);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: shared } })).ownerId).toBe(heir.user.id);
  });
});

// A document shared into a campaign records who shared it. Deleting that
// person's account removed the share with them, so the campaign lost the
// handout. The share now passes to the campaign's DM, or to its owner when
// the DM seat was theirs.
describe('documents the person shared into a campaign', () => {
  const documentIds: string[] = [];
  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { id: { in: documentIds } } });
  });
  const documentOf = (uploadedById: string) =>
    prisma.asset.create({
      data: {
        type: 'DOCUMENT', scope: 'USER', uploadedById,
        filename: `${randomUUID()}.md`, originalName: 'handout.md', mimeType: 'text/markdown', fileSize: 1,
        filePath: `/nonexistent/${randomUUID()}.md`, name: 'Handout',
      },
    }).then((asset) => { documentIds.push(asset.id); return asset; });

  it('stay shared, passed to the DM, when a former DM deletes their account', async () => {
    const owner = await member('Docs Owner');
    const former = await member('Docs Former DM');
    const current = await member('Docs Current DM');
    const campaignId = await campaignRunBy(owner.user.id, current.user.id, [former.user.id]);
    const doc = await documentOf(former.user.id);
    const link = await prisma.campaignDocument.create({ data: { campaignId, assetId: doc.id, linkedById: former.user.id } });

    expect((await former.agent.delete('/api/auth/account').send({ password: TEST_PASSWORD })).status).toBe(200);

    expect((await prisma.campaignDocument.findUniqueOrThrow({ where: { id: link.id } })).linkedById).toBe(current.user.id);
    const listed = await owner.agent.get(`/api/campaigns/${campaignId}/documents`);
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain(doc.id);
  });

  it('pass to the owner when the person deleting their account is the DM', async () => {
    const owner = await member('Docs Owner 2');
    const dm = await member('Docs Sitting DM');
    const campaignId = await campaignRunBy(owner.user.id, dm.user.id);
    const doc = await documentOf(dm.user.id);
    const link = await prisma.campaignDocument.create({ data: { campaignId, assetId: doc.id, linkedById: dm.user.id } });

    expect((await dm.agent.delete('/api/auth/account').send({ password: TEST_PASSWORD })).status).toBe(200);

    expect((await prisma.campaignDocument.findUniqueOrThrow({ where: { id: link.id } })).linkedById).toBe(owner.user.id);
  });
});
