/**
 * The game system enum held one value of an unreleased system until 1.7.0's
 * migration gave its rows no system and dropped it. A request that names it
 * is refused as one naming any value that is no game system is, in words
 * that repeat neither. An archive naming it imports with no system
 * (services/__tests__/campaignImportShapes.test.ts), and a row stored with it
 * is given none by the migration (legacy/__tests__/storedNamesMigration.test.ts).
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-retired-system-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { RETIRED_GAME_SYSTEM as retired } from '../../__tests__/helpers/retiredGameSystem';

jest.setTimeout(60_000);

const REFUSED = 'CozyVTT does not support that game system.';
const statBlock = { ac: 12, speed: '30 ft.', abilities: { str: 10, dex: 12, con: 10, int: 10, wis: 10, cha: 10 } };

const app = createTestApp();
let gmId: string;
let gm: ReturnType<typeof request.agent>;
let campaignId: string;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Retired System' });
  gmId = user.id;
  gm = request.agent(app);
  await gm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  campaignId = (await createTestCampaign(gmId, { name: 'Supported', gameSystem: 'FIFTH_EDITION' })).id;
  await prisma.campaignMembership.create({ data: { userId: gmId, campaignId, role: 'GM', characterIds: [] } });
});

afterAll(async () => {
  await prisma.characterTemplate.deleteMany({ where: { createdById: gmId } });
  await prisma.campaign.deleteMany({ where: { ownerId: gmId } });
  await cleanupUsers([gmId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

/** A refusal names no game system identifier, so none can reach a screen. */
function namesNoIdentifier(message: unknown): void {
  expect(typeof message).toBe('string');
  expect(String(message)).not.toMatch(/FIFTH_EDITION|FANTASY_D20|HORROR_D100/);
  expect(String(message)).not.toContain(retired);
}

describe('a request giving something the retired value', () => {
  it('creates no character', async () => {
    const res = await gm.post('/api/characters').send({ name: 'Ada Example', gameSystem: retired, data: {} });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message: REFUSED });
    namesNoIdentifier(res.body.message);
    expect(await prisma.character.count({ where: { userId: gmId, name: 'Ada Example' } })).toBe(0);
  });

  it('creates no campaign', async () => {
    const res = await gm.post('/api/campaigns').send({ name: 'Quiet Valley', gameSystem: retired });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message: REFUSED });
    namesNoIdentifier(res.body.message);
    expect(await prisma.campaign.count({ where: { ownerId: gmId, name: 'Quiet Valley' } })).toBe(0);
  });

  it('gives it to no campaign', async () => {
    const res = await gm.put(`/api/campaigns/${campaignId}`).send({ gameSystem: retired });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message: REFUSED });
    namesNoIdentifier(res.body.message);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).gameSystem).toBe('FIFTH_EDITION');
  });

  it('creates no character template', async () => {
    const res = await gm.post('/api/character-templates').send({ name: 'Sample Template', gameSystem: retired, data: {} });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message: REFUSED });
    namesNoIdentifier(res.body.message);
    expect(await prisma.characterTemplate.count({ where: { createdById: gmId, name: 'Sample Template' } })).toBe(0);
  });

  it('creates no creature, and changes none to it', async () => {
    const created = await gm.post(`/api/campaigns/${campaignId}/creatures`).send({ name: 'Pond Newt', statBlock, gameSystem: retired });
    expect(created.status).toBe(400);
    expect(created.body).toEqual({ error: 'Validation Error', message: `gameSystem: ${REFUSED}` });
    namesNoIdentifier(created.body.message);

    const kept = await gm.post(`/api/campaigns/${campaignId}/creatures`).send({ name: 'Wolf', statBlock, gameSystem: 'FIFTH_EDITION' });
    expect(kept.status).toBe(201);
    const changed = await gm.put(`/api/campaigns/${campaignId}/creatures/${kept.body.id}`).send({ gameSystem: retired });
    expect(changed.status).toBe(400);
    expect(changed.body).toEqual({ error: 'Validation Error', message: `gameSystem: ${REFUSED}` });
    namesNoIdentifier(changed.body.message);
    expect((await prisma.creatureTemplate.findUniqueOrThrow({ where: { id: kept.body.id } })).gameSystem).toBe('FIFTH_EDITION');
  });

  it('finds no built-in sheet for it', async () => {
    const res = await gm.get(`/api/characters/templates/${retired}/blank`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message: REFUSED });
    namesNoIdentifier(res.body.message);
  });

  it('filters no list by it', async () => {
    const templates = await gm.get('/api/character-templates').query({ gameSystem: retired });
    expect(templates.status).toBe(400);
    expect(templates.body).toEqual({ error: 'Validation Error', message: REFUSED });
    namesNoIdentifier(templates.body.message);

    const creatures = await gm.get(`/api/campaigns/${campaignId}/creatures`).query({ gameSystem: retired });
    expect(creatures.status).toBe(400);
    expect(creatures.body).toEqual({ error: 'Validation Error', message: REFUSED });
    namesNoIdentifier(creatures.body.message);
  });
});

// Any other value is answered the same way, without the value sent.
describe('a request giving a value that is no game system', () => {
  const odd = 'NOT_A_SYSTEM';

  it.each([
    ['a character', () => gm.post('/api/characters').send({ name: 'Odd One', gameSystem: odd, data: {} }), REFUSED],
    ['a campaign', () => gm.post('/api/campaigns').send({ name: 'Odd Valley', gameSystem: odd }), REFUSED],
    ['a campaign change', () => gm.put(`/api/campaigns/${campaignId}`).send({ gameSystem: odd }), REFUSED],
    ['a character template', () => gm.post('/api/character-templates').send({ name: 'Odd Template', gameSystem: odd, data: {} }), REFUSED],
    ['a creature', () => gm.post(`/api/campaigns/${campaignId}/creatures`).send({ name: 'Odd Newt', statBlock, gameSystem: odd }), `gameSystem: ${REFUSED}`],
    ['a built-in sheet', () => gm.get(`/api/characters/templates/${odd}/blank`), REFUSED],
    ['the template list', () => gm.get('/api/character-templates').query({ gameSystem: odd }), REFUSED],
    ['the creature list', () => gm.get(`/api/campaigns/${campaignId}/creatures`).query({ gameSystem: odd }), REFUSED],
  ])('is refused in plain words for %s', async (_what, send, message) => {
    const res = await send();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message });
    namesNoIdentifier(res.body.message);
    expect(res.body.message).not.toContain(odd);
  });
});
