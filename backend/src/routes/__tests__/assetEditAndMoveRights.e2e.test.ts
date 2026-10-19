/**
 * Who may rewrite a document, and who may move a global asset out of the
 * library, follow the rule for deleting it.
 *
 * Editing a document's text checked only that the caller had uploaded it.
 * Deleting a campaign's document is tied to the campaign: its uploader while
 * still a member, its DM, or an admin. So a DM who wrote a campaign handout,
 * handed the seat on and was removed could still rewrite what every member
 * reads, while the campaign's DM could not edit the campaign's own document.
 * A global document's uploader kept the right after losing Global Assets.
 * Moving a global asset to another scope let any global asset manager take
 * another manager's asset out of the library, which deleting it forbids.
 * Refused edits answer 404, as before, so a reply never confirms an id.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-asset-rights-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

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
const userIds: string[] = [];
const campaignIds: string[] = [];

async function signedIn(displayName: string, globalAssetManager = false) {
  const user = await createTestUser({ displayName });
  userIds.push(user.id);
  if (globalAssetManager) await prisma.user.update({ where: { id: user.id }, data: { globalAssetManager: true } });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent };
}

async function documentBy(agent: ReturnType<typeof request.agent>, scope: 'CAMPAIGN' | 'GLOBAL', campaignId?: string) {
  const res = await agent.post('/api/assets/documents').send({ name: 'Session zero', format: 'md', content: '# House rules', scope, campaignId });
  expect(res.status).toBe(201);
  return res.body.asset.id as string;
}

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: userIds } } });
  await cleanupCampaigns(campaignIds);
  await cleanupUsers(userIds);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('editing a campaign document', () => {
  it('is refused to a former DM removed from the campaign, and open to the DM who runs it now', async () => {
    const owner = await signedIn('Campaign Owner');
    const coHost = await signedIn('Former Co-host');
    const campaign = await createTestCampaign(owner.id);
    campaignIds.push(campaign.id);
    // The co-host held the seat and wrote the handout.
    await prisma.campaignMembership.createMany({
      data: [
        { userId: owner.id, campaignId: campaign.id, role: 'PLAYER', characterIds: [] },
        { userId: coHost.id, campaignId: campaign.id, role: 'DM', characterIds: [] },
      ],
    });
    const id = await documentBy(coHost.agent, 'CAMPAIGN', campaign.id);

    // The owner takes the seat back and removes the co-host.
    await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: owner.id, campaignId: campaign.id } }, data: { role: 'DM' } });
    await prisma.campaignMembership.delete({ where: { userId_campaignId: { userId: coHost.id, campaignId: campaign.id } } });

    const former = await coHost.agent.put(`/api/assets/documents/${id}/content`).send({ content: 'False rulings' });
    expect(former.status).toBe(404);
    expect(former.body.message).toBe('Document not found');

    const current = await owner.agent.put(`/api/assets/documents/${id}/content`).send({ content: '# House rules, revised' });
    expect(current.status).toBe(200);
  });

  it('stays open to its uploader while they are still a member', async () => {
    const dm = await signedIn('Handout Writer');
    const campaign = await createTestCampaign(dm.id);
    campaignIds.push(campaign.id);
    await prisma.campaignMembership.create({ data: { userId: dm.id, campaignId: campaign.id, role: 'DM', characterIds: [] } });
    const id = await documentBy(dm.agent, 'CAMPAIGN', campaign.id);

    expect((await dm.agent.put(`/api/assets/documents/${id}/content`).send({ content: 'Edited' })).status).toBe(200);
  });

  it('is refused to a player of the campaign who did not write it', async () => {
    const dm = await signedIn('Handout DM');
    const player = await signedIn('Handout Reader');
    const campaign = await createTestCampaign(dm.id);
    campaignIds.push(campaign.id);
    await prisma.campaignMembership.createMany({
      data: [
        { userId: dm.id, campaignId: campaign.id, role: 'DM', characterIds: [] },
        { userId: player.id, campaignId: campaign.id, role: 'PLAYER', characterIds: [] },
      ],
    });
    const id = await documentBy(dm.agent, 'CAMPAIGN', campaign.id);

    expect((await player.agent.put(`/api/assets/documents/${id}/content`).send({ content: 'Edited' })).status).toBe(404);
  });
});

describe('editing a global document', () => {
  it('is refused to its uploader once they no longer manage global assets', async () => {
    const manager = await signedIn('Lapsed Manager', true);
    const id = await documentBy(manager.agent, 'GLOBAL');
    expect((await manager.agent.put(`/api/assets/documents/${id}/content`).send({ content: 'Still mine' })).status).toBe(200);

    await prisma.user.update({ where: { id: manager.id }, data: { globalAssetManager: false } });
    const res = await manager.agent.put(`/api/assets/documents/${id}/content`).send({ content: 'Not any more' });
    expect(res.status).toBe(404);
  });
});

describe('moving a global asset out of the library', () => {
  it('is refused to a global asset manager who did not upload it, as deleting it is', async () => {
    const curator = await signedIn('Curator', true);
    const other = await signedIn('Other Manager', true);
    const id = await documentBy(curator.agent, 'GLOBAL');

    const res = await other.agent.patch(`/api/assets/${id}/scope`).send({ scope: 'USER' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Only admins or the uploading global asset manager can move a global asset out of the library');
    expect((await prisma.asset.findUniqueOrThrow({ where: { id } })).scope).toBe('GLOBAL');
  });

  it('is open to the manager who uploaded it', async () => {
    const curator = await signedIn('Own Curator', true);
    const id = await documentBy(curator.agent, 'GLOBAL');

    const res = await curator.agent.patch(`/api/assets/${id}/scope`).send({ scope: 'USER' });
    expect(res.status).toBe(200);
    expect(res.body.asset.scope).toBe('USER');
  });
});

describe('moving a campaign asset with no campaign recorded', () => {
  it('is refused to anyone but an admin, so nobody can carry it into a campaign of their own', async () => {
    const uploader = await signedIn('Orphan Uploader');
    const stranger = await signedIn('Stranger DM');
    const theirs = await createTestCampaign(stranger.id);
    campaignIds.push(theirs.id);
    await prisma.campaignMembership.create({ data: { userId: stranger.id, campaignId: theirs.id, role: 'DM', characterIds: [] } });
    const orphan = await prisma.asset.create({
      data: {
        type: 'MAP', scope: 'CAMPAIGN', campaignId: null, uploadedById: uploader.id,
        filename: 'orphan.png', originalName: 'orphan.png', mimeType: 'image/png', fileSize: 1,
        filePath: path.join(UPLOAD_DIR, 'orphan.png'), name: 'Orphaned lair', tags: [],
      },
    });

    const res = await stranger.agent.patch(`/api/assets/${orphan.id}/scope`).send({ scope: 'CAMPAIGN', campaignId: theirs.id });
    expect(res.status).toBe(404);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: orphan.id } })).campaignId).toBeNull();
  });
});

describe('the scope move body', () => {
  it('refuses a campaign id that is not one, before looking anything up', async () => {
    const curator = await signedIn('Body Checker', true);
    const id = await documentBy(curator.agent, 'GLOBAL');
    const res = await curator.agent.patch(`/api/assets/${id}/scope`).send({ scope: 'CAMPAIGN', campaignId: 'not-an-id' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('campaignId must be a campaign id');
  });

  it('still names the scopes when the scope is wrong', async () => {
    const curator = await signedIn('Scope Namer', true);
    const id = await documentBy(curator.agent, 'GLOBAL');
    const res = await curator.agent.patch(`/api/assets/${id}/scope`).send({ scope: 'EVERYWHERE' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('scope must be GLOBAL, USER, or CAMPAIGN');
  });
});

// The campaign's document list says, for each document, whether the caller
// may edit it, by the rule the edit applies, so the page offers Edit exactly
// when a save would be taken. It offered Edit on a global document to its
// uploader after they lost Global Assets, and the save then answered 404.
describe('the campaign document list', () => {
  type Listed = { id: string; canEdit: boolean };

  it('says who may edit each document, matching what the edit answers', async () => {
    const dm = await signedIn('Listing Manager', true);
    const player = await signedIn('Listing Player');
    const campaign = await createTestCampaign(dm.id);
    campaignIds.push(campaign.id);
    await prisma.campaignMembership.createMany({
      data: [
        { userId: dm.id, campaignId: campaign.id, role: 'DM', characterIds: [] },
        { userId: player.id, campaignId: campaign.id, role: 'PLAYER', characterIds: [] },
      ],
    });
    const global = await documentBy(dm.agent, 'GLOBAL');
    expect((await dm.agent.post(`/api/campaigns/${campaign.id}/documents`).send({ assetId: global })).status).toBe(201);
    const own = await documentBy(dm.agent, 'CAMPAIGN', campaign.id);

    const listedFor = async (agent: ReturnType<typeof request.agent>) => {
      const res = await agent.get(`/api/campaigns/${campaign.id}/documents`);
      expect(res.status).toBe(200);
      return Object.fromEntries((res.body.documents as Listed[]).map((d) => [d.id, d.canEdit]));
    };
    const saves = async (agent: ReturnType<typeof request.agent>, id: string) =>
      (await agent.put(`/api/assets/documents/${id}/content`).send({ content: '# Revised' })).status === 200;

    expect(await listedFor(dm.agent)).toEqual({ [global]: true, [own]: true });
    expect(await listedFor(player.agent)).toEqual({ [global]: false, [own]: false });

    await prisma.user.update({ where: { id: dm.id }, data: { globalAssetManager: false } });
    const lapsed = await listedFor(dm.agent);
    expect(lapsed).toEqual({ [global]: false, [own]: true });
    expect(await saves(dm.agent, global)).toBe(lapsed[global]);
    expect(await saves(dm.agent, own)).toBe(lapsed[own]);
    expect(await saves(player.agent, own)).toBe(false);
  });
});

// The asset list says the same of each asset, for the Documents page, which
// offered Edit and Delete to an admin and to the uploader: a global
// document's uploader who no longer manages global assets was offered both
// and refused, and the DM of a campaign was offered neither on the
// campaign's own documents, which they may change.
describe('the asset list', () => {
  type Listed = { id: string; canChange: boolean };

  it('says of each document whether the caller may change it, matching what editing and deleting answer', async () => {
    const writer = await signedIn('Library Writer', true);
    const dm = await signedIn('Library DM');
    const player = await signedIn('Library Player');
    const campaign = await createTestCampaign(dm.id);
    campaignIds.push(campaign.id);
    // The writer held the seat when they wrote the handout.
    await prisma.campaignMembership.createMany({
      data: [
        { userId: writer.id, campaignId: campaign.id, role: 'DM', characterIds: [] },
        { userId: dm.id, campaignId: campaign.id, role: 'PLAYER', characterIds: [] },
        { userId: player.id, campaignId: campaign.id, role: 'PLAYER', characterIds: [] },
      ],
    });
    const global = await documentBy(writer.agent, 'GLOBAL');
    const handout = await documentBy(writer.agent, 'CAMPAIGN', campaign.id);
    // The seat passes on; the writer stays as a player.
    await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: writer.id, campaignId: campaign.id } }, data: { role: 'PLAYER' } });
    await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: dm.id, campaignId: campaign.id } }, data: { role: 'DM' } });

    const listedFor = async (agent: ReturnType<typeof request.agent>) => {
      const res = await agent.get('/api/assets').query({ type: 'DOCUMENT', limit: 100 });
      expect(res.status).toBe(200);
      const flags = new Map((res.body.assets as Listed[]).map((a) => [a.id, a.canChange]));
      return { global: flags.get(global), handout: flags.get(handout) };
    };

    expect(await listedFor(writer.agent)).toEqual({ global: true, handout: true });
    expect(await listedFor(dm.agent)).toEqual({ global: false, handout: true });
    expect(await listedFor(player.agent)).toEqual({ global: false, handout: false });

    await prisma.user.update({ where: { id: writer.id }, data: { globalAssetManager: false } });
    expect(await listedFor(writer.agent)).toEqual({ global: false, handout: true });

    // What the list says is what the routes answer.
    expect((await writer.agent.put(`/api/assets/documents/${global}/content`).send({ content: '# Revised' })).status).toBe(404);
    expect((await writer.agent.delete(`/api/assets/${global}`)).status).toBe(403);
    expect((await player.agent.delete(`/api/assets/${handout}`)).status).toBe(403);
    expect((await dm.agent.put(`/api/assets/documents/${handout}/content`).send({ content: '# Revised' })).status).toBe(200);
  });
});

// The Asset Library offers Delete and Move from canChange, which the list
// sends; the move's reply carries it too, so the panel stays right afterwards.
describe('a move\'s reply', () => {
  it('says whether the mover may still change the asset where it now is', async () => {
    const dm = await signedIn('Move Reply DM');
    const table = await createTestCampaign(dm.id);
    campaignIds.push(table.id);
    await prisma.campaignMembership.create({ data: { userId: dm.id, campaignId: table.id, role: 'DM', characterIds: [] } });
    const art = await prisma.asset.create({
      data: {
        type: 'TOKEN', scope: 'USER', uploadedById: dm.id, filename: 'art.png', originalName: 'art.png', mimeType: 'image/png',
        fileSize: 1, filePath: path.join(UPLOAD_DIR, 'art.png'), name: 'Art', tags: [],
      },
    });

    const res = await dm.agent.patch(`/api/assets/${art.id}/scope`).send({ scope: 'CAMPAIGN', campaignId: table.id });

    expect(res.status).toBe(200);
    expect(res.body.asset).toMatchObject({ scope: 'CAMPAIGN', campaignId: table.id, canChange: true });
  });
});
