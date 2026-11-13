/**
 * Every value versions before 1.7.0 stored and sent is still taken, by every
 * path that takes one, and answered with its new value: a game system in a
 * request's body, query or path, the system a stat block names, the GM's
 * role, the route that hands the GM's seat over, and everything a campaign
 * archive an older version exported holds.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-old-values-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { writeZip } from '../../__tests__/helpers/zipFixtures';
import { importCampaign } from '../../services/campaignImporter';
import { getBlankTemplate } from '../../utils/character-templates';
import { readJsonObject } from '../../utils/prisma-json';
import { LEGACY_GAME_SYSTEMS, LEGACY_GM } from '../gameSystemAliases';

jest.setTimeout(60_000);

const OLD = Object.entries(LEGACY_GAME_SYSTEMS);
const statBlock = (gameSystem?: string) => ({
  ac: 12, speed: '30 ft.', abilities: { str: 11, dex: 14, con: 12, int: 10, wis: 10, cha: 10 }, ...(gameSystem ? { gameSystem } : {}),
});

const app = createTestApp();
let gmId: string;
let playerId: string;
let gm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;
let campaignId: string;
let mapId: string;

async function signIn(email: string): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const gmUser = await createTestUser({ displayName: 'Old Values GM' });
  const playerUser = await createTestUser({ displayName: 'Old Values Player' });
  gmId = gmUser.id;
  playerId = playerUser.id;
  gm = await signIn(gmUser.email);
  player = await signIn(playerUser.email);

  // Made by the route with the 5E system's old value, so the GM's membership is the route's own.
  const made = await gm.post('/api/campaigns').send({ name: 'Old values', gameSystem: 'DND_5E' });
  expect(made.status).toBe(201);
  campaignId = made.body.campaign.id;
  await prisma.campaignMembership.create({ data: { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] } });
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Cellar', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none', width: 10, height: 10, gridSize: 50, tokens: [], annotations: [] },
  })).id;
});

afterAll(async () => {
  await prisma.characterTemplate.deleteMany({ where: { createdById: { in: [gmId, playerId] } } });
  await prisma.campaign.deleteMany({ where: { ownerId: { in: [gmId, playerId] } } });
  await cleanupUsers([gmId, playerId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe('a game system named by its old value', () => {
  it('makes a campaign the route answers, and stores, with the new value and the GM as GM', async () => {
    const made = await gm.post('/api/campaigns').send({ name: 'Made old', gameSystem: 'PATHFINDER_2E' });
    expect(made.status).toBe(201);
    expect(made.body.campaign.gameSystem).toBe('FANTASY_D20');
    expect(made.body.campaign.memberships.map((m: { role: string }) => m.role)).toEqual(['GM']);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).gameSystem).toBe('FIFTH_EDITION');
  });

  it.each(OLD)('changes a campaign to %s, stored as %s', async (old, now) => {
    const res = await gm.put(`/api/campaigns/${campaignId}`).send({ gameSystem: old });
    expect(res.status).toBe(200);
    expect(res.body.campaign.gameSystem).toBe(now);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).gameSystem).toBe(now);
    await prisma.campaign.update({ where: { id: campaignId }, data: { gameSystem: 'FIFTH_EDITION' } });
  });

  it.each(OLD)('finds the built-in sheet for %s, answered as %s, and makes and changes a character with it', async (old, now) => {
    const template = await gm.get(`/api/characters/templates/${old}/blank`);
    expect(template.status).toBe(200);
    expect(template.body.gameSystem).toBe(now);

    const made = await gm.post('/api/characters').send({ name: `Old ${now}`, gameSystem: old, data: template.body.data });
    expect(made.status).toBe(201);
    expect(made.body.character.gameSystem).toBe(now);

    const changed = await gm.put(`/api/characters/${made.body.character.id}`).send({ gameSystem: old, data: template.body.data });
    expect(changed.status).toBe(200);
    expect((await prisma.character.findUniqueOrThrow({ where: { id: made.body.character.id } })).gameSystem).toBe(now);
  });

  it.each(OLD)('makes a character template with %s, stored as %s, and lists templates by it', async (old, now) => {
    const made = await gm.post('/api/character-templates').send({ name: `Old template ${now}`, gameSystem: old, data: getBlankTemplate(now).data });
    expect(made.status).toBe(201);
    expect(made.body.gameSystem).toBe(now);

    const listed = await gm.get('/api/character-templates').query({ gameSystem: old, mine: 'true' });
    expect(listed.status).toBe(200);
    expect(listed.body.templates.map((t: { id: string }) => t.id)).toContain(made.body.id);
    expect(new Set(listed.body.templates.map((t: { gameSystem: string }) => t.gameSystem))).toEqual(new Set([now]));
  });

  it.each(OLD)('makes and changes a creature with %s, its stat block naming it too, stored as %s, and lists creatures by it', async (old, now) => {
    const made = await gm.post(`/api/campaigns/${campaignId}/creatures`).send({ name: `Old beast ${now}`, gameSystem: old, statBlock: statBlock(old) });
    expect(made.status).toBe(201);
    expect(made.body.gameSystem).toBe(now);
    expect(made.body.statBlock.gameSystem).toBe(now);

    const changed = await gm.put(`/api/campaigns/${campaignId}/creatures/${made.body.id}`).send({ statBlock: statBlock(old) });
    expect(changed.status).toBe(200);
    expect(readJsonObject((await prisma.creatureTemplate.findUniqueOrThrow({ where: { id: made.body.id } })).statBlock)?.gameSystem).toBe(now);

    const listed = await gm.get(`/api/campaigns/${campaignId}/creatures`).query({ gameSystem: old });
    expect(listed.status).toBe(200);
    expect(listed.body.creatures.map((c: { id: string }) => c.id)).toContain(made.body.id);
    expect(new Set(listed.body.creatures.map((c: { gameSystem: string }) => c.gameSystem))).toEqual(new Set([now]));
  });
});

describe('a stat block naming its system by an old value', () => {
  it('is stored with the new value on a token template', async () => {
    const made = await gm.post(`/api/campaigns/${campaignId}/token-templates`).send({ name: 'Old guard', type: 'npc', statBlock: statBlock('DND_5E') });
    expect(made.status).toBe(201);
    const stored = await prisma.tokenTemplate.findUniqueOrThrow({ where: { id: made.body.id ?? made.body.template?.id } });
    expect(readJsonObject(stored.statBlock)?.gameSystem).toBe('FIFTH_EDITION');
  });

  it('is stored with the new value on a token placed on a map', async () => {
    const made = await gm.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({ name: 'Old wolf', position: { x: 1, y: 1 }, statBlock: statBlock('DND_5E') });
    expect(made.status).toBe(201);
    const tokens = (await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).tokens as Array<{ name: string; statBlock?: { gameSystem?: string } }>;
    expect(tokens.find((t) => t.name === 'Old wolf')?.statBlock?.gameSystem).toBe('FIFTH_EDITION');
  });
});

describe('the GM\'s old value', () => {
  it('is read as GM by the role route, which then refuses a second GM', async () => {
    const res = await gm.put(`/api/campaigns/${campaignId}/members/${playerId}/role`).send({ role: LEGACY_GM });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Campaign already has a GM. Only one GM per campaign is allowed.');
  });

  it('hands the seat over at the route\'s old path, answering every role with the new value', async () => {
    const res = await gm.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId });
    expect(res.status).toBe(200);
    const roles = Object.fromEntries(res.body.memberships.map((m: { userId: string; role: string }) => [m.userId, m.role]));
    expect(roles).toEqual({ [gmId]: 'PLAYER', [playerId]: 'GM' });

    const back = await player.put(`/api/campaigns/${campaignId}/gm`).send({ userId: gmId });
    expect(back.status).toBe(200);
  });

  it('names a pending invitation\'s GM under its new field and its old one', async () => {
    const invitee = await createTestUser({ displayName: 'Old Values Invitee' });
    try {
      const agent = await signIn(invitee.email);
      await prisma.campaignInvitation.create({ data: { campaignId, userId: invitee.id } });
      const res = await agent.get('/api/invitations');
      expect(res.status).toBe(200);
      expect(res.body[0].campaign.gm).toEqual({ displayName: 'Old Values GM' });
      expect(res.body[0].campaign.dm).toEqual(res.body[0].campaign.gm);
    } finally {
      await cleanupUsers([invitee.id]);
    }
  });
});

/** A campaign archive as 1.6.0 wrote one, with every value it used. */
async function oldArchive(): Promise<string> {
  const file = path.join(SCRATCH, `${randomUUID()}.cozyvtt`);
  const drawing = (fields: Record<string, unknown>) => ({ kind: 'line', color: '#3d8bd9', width: 2, points: [[10, 10], [60, 60]], ...fields });
  await writeZip(file, Object.entries({
    'manifest.json': JSON.stringify({
      formatVersion: 1, exportedAt: '2026-11-01T00:00:00.000Z', exportedFrom: 'CozyVTT v1.6.0', campaignName: 'Old archive',
      gameSystem: 'CALL_OF_CTHULHU_7E', mapCount: 1, tokenCount: 1, creatureCount: 1, tokenTemplateCount: 1, assetCount: 0, includesAudio: false, totalSizeBytes: 0,
    }),
    'campaign.json': JSON.stringify({ name: 'Old archive', gameSystem: 'CALL_OF_CTHULHU_7E' }),
    'maps/map-0.json': JSON.stringify({
      name: 'Crypt', width: 10, height: 10, gridSize: 50, feetPerSquare: 5,
      tokens: [{ name: 'Ghoul', position: { x: 2, y: 2 }, size: { width: 1, height: 1 }, statBlock: statBlock('CALL_OF_CTHULHU_7E') }],
      drawings: [
        drawing({ audience: LEGACY_GM, share: LEGACY_GM }),
        drawing({ audience: 'ALL', share: LEGACY_GM }),
        drawing({ audience: 'ALL', share: 'PLAYERS' }),
      ],
    }),
    'creatures/creatures.json': JSON.stringify([{ name: 'Ghoul', gameSystem: 'CALL_OF_CTHULHU_7E', statBlock: statBlock('CALL_OF_CTHULHU_7E') }]),
    'token-templates/templates.json': JSON.stringify([{ name: 'Wolf', type: 'npc', statBlock: statBlock('DND_5E') }]),
  }).map(([name, data]) => ({ name, data })));
  return file;
}

describe('a campaign archive an older version exported', () => {
  it('is previewed with its system\'s new value', async () => {
    const res = await gm.post('/api/campaigns/import/preview').attach('file', await oldArchive());
    expect(res.status).toBe(200);
    expect(res.body.preview).toMatchObject({ campaignName: 'Old archive', gameSystem: 'HORROR_D100' });
  });

  it('imports with its system, its creatures\' and stat blocks\' systems, and its drawings for the GM alone', async () => {
    const file = await oldArchive();

    const result = await importCampaign(file, gmId);

    expect(result.warnings).toEqual([]);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } })).gameSystem).toBe('HORROR_D100');
    expect(await prisma.campaignMembership.findMany({ where: { campaignId: result.campaignId }, select: { userId: true, role: true } }))
      .toEqual([{ userId: gmId, role: 'GM' }]);

    const creatures = await prisma.creatureTemplate.findMany({ where: { campaignId: result.campaignId } });
    expect(creatures.map((c) => [c.gameSystem, readJsonObject(c.statBlock)?.gameSystem])).toEqual([['HORROR_D100', 'HORROR_D100']]);
    const templates = await prisma.tokenTemplate.findMany({ where: { campaignId: result.campaignId } });
    expect(templates.map((t) => readJsonObject(t.statBlock)?.gameSystem)).toEqual(['FIFTH_EDITION']);

    const map = await prisma.map.findFirstOrThrow({ where: { campaignId: result.campaignId } });
    expect((map.tokens as Array<{ statBlock?: { gameSystem?: string } }>).map((t) => t.statBlock?.gameSystem)).toEqual(['HORROR_D100']);
    const drawings = await prisma.mapDrawing.findMany({ where: { mapId: map.id }, orderBy: { sortKey: 'asc' }, select: { audience: true, authorId: true } });
    // The GM's share is written as the importing GM's, the players' with no author.
    expect(drawings).toEqual([{ audience: 'GM', authorId: gmId }, { audience: 'ALL', authorId: gmId }, { audience: 'ALL', authorId: null }]);
  });
});
