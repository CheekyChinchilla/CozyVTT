/**
 * The worked examples in docs/API_REFERENCE.md show the fields the server
 * really sends.
 *
 * The guide is what a script author reads first, and spec-coverage.py checks
 * only that its headings name real routes, not that the bodies under them are
 * right. Several were wrong at once: a bare list where the server sends an
 * object, a field named for what the database calls something else, and a
 * 401 body the server never sent. Each example's JSON is read out of the guide
 * and every field it shows must be in what the route answers. The guide may
 * show fewer fields than the route sends (it says the OpenAPI file has the
 * full shapes); it may not show one that is not there.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { AssetScope, AssetType } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const guide = fs.readFileSync(path.resolve(__dirname, '../../../../docs/API_REFERENCE.md'), 'utf8');

/**
 * The first json block under `heading`, up to the next heading, parsed. With
 * `after`, the first one after that text, for a route whose request body is
 * shown before its response.
 */
function exampleUnder(heading: string, after?: string): unknown {
  const start = guide.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`docs/API_REFERENCE.md has no heading ${heading}`);
  const rest = guide.slice(start + heading.length + 2);
  const next = rest.search(/\n#{2,3} /);
  let section = next === -1 ? rest : rest.slice(0, next);
  if (after !== undefined) {
    const at = section.indexOf(after);
    if (at === -1) throw new Error(`${heading} has no ${after}`);
    section = section.slice(at);
  }
  const block = /```json\n([\s\S]*?)\n```/.exec(section);
  if (!block) throw new Error(`${heading} has no json example`);
  return JSON.parse(block[1]);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The fields `shown` has that `actual` has not, as paths. A list is compared
 * by its first item, so the route's answer must have one.
 */
function missingFields(shown: unknown, actual: unknown, at = ''): string[] {
  if (Array.isArray(shown)) {
    if (shown.length === 0) return [];
    if (!Array.isArray(actual)) return [`${at || 'the body'} is not a list`];
    if (actual.length === 0) return [`${at || 'the body'} was empty, so its first item cannot be compared`];
    return missingFields(shown[0], actual[0], `${at}[]`);
  }
  if (!isObject(shown)) return [];
  if (!isObject(actual)) return [`${at || 'the body'} is not an object`];
  return Object.entries(shown).flatMap(([key, value]) =>
    key in actual ? missingFields(value, actual[key], at ? `${at}.${key}` : key) : [at ? `${at}.${key}` : key]
  );
}

describe('the worked examples in docs/API_REFERENCE.md', () => {
  let dmId: string;
  let playerId: string;
  let campaignId: string;
  let assetId: string;
  let dm: ReturnType<typeof request.agent>;
  let email: string;

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Reference DM' });
    dmId = dmUser.id;
    email = dmUser.email;
    const player = await createTestUser({ displayName: 'Reference Player' });
    playerId = player.id;
    const campaign = await createTestCampaign(dmId, { name: 'Reference Table', gameSystem: 'DND_5E' });
    campaignId = campaign.id;
    await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
    const character = await prisma.character.create({
      data: { userId: playerId, campaignId, name: 'Reference Hero', gameSystem: 'DND_5E', data: { hp: { current: 24, maximum: 31, temporary: 0 } } },
    });
    await prisma.campaignMembership.create({ data: { userId: playerId, campaignId, role: 'PLAYER', characterIds: [character.id] } });
    assetId = (
      await prisma.asset.create({
        data: {
          name: 'Reference Token',
          filename: `reference-${Math.random().toString(36).slice(2)}.png`,
          originalName: 'reference.png',
          mimeType: 'image/png',
          fileSize: 128,
          filePath: `tokens/reference-${Math.random().toString(36).slice(2)}.png`,
          type: AssetType.TOKEN,
          scope: AssetScope.USER,
          uploadedById: dmId,
        },
      })
    ).id;
    dm = request.agent(app);
  });

  afterAll(async () => {
    try {
      await prisma.asset.deleteMany({ where: { id: assetId } });
      await cleanupCampaigns([campaignId]);
      await cleanupUsers([dmId, playerId]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('shows the 401 a route sends when nobody is signed in', async () => {
    const res = await request(app).get('/api/campaigns');

    expect(res.status).toBe(401);
    const shown = exampleUnder('### Error Responses for Unauthenticated Requests') as Record<string, unknown>;
    expect(missingFields(shown, res.body)).toEqual([]);
    expect(shown.error).toBe(res.body.error);
  });

  it('shows what signing in answers', async () => {
    const res = await dm.post('/api/auth/login').send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(missingFields(exampleUnder('### `POST /api/auth/login`', '**Response (success):**'), res.body)).toEqual([]);
  });

  it('shows GET /api/auth/me', async () => {
    const res = await dm.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(missingFields(exampleUnder('### `GET /api/auth/me`'), res.body)).toEqual([]);
  });

  it('shows GET /api/campaigns', async () => {
    const res = await dm.get('/api/campaigns');

    expect(res.status).toBe(200);
    expect(missingFields(exampleUnder('### `GET /api/campaigns`'), res.body)).toEqual([]);
  });

  it('shows the roster GET /api/campaigns/:id/characters sends', async () => {
    const res = await dm.get(`/api/campaigns/${campaignId}/characters`);

    expect(res.status).toBe(200);
    // The DM has no character; the guide's entry is a player's, so compare that one.
    const roster = [...res.body.roster].sort(
      (a: { characters: unknown[] }, b: { characters: unknown[] }) => b.characters.length - a.characters.length
    );
    expect(missingFields(exampleUnder('### `GET /api/campaigns/:id/characters`'), { roster })).toEqual([]);
  });

  it('shows GET /api/assets', async () => {
    const res = await dm.get('/api/assets');

    expect(res.status).toBe(200);
    expect(res.body.assets.some((asset: { id: string }) => asset.id === assetId)).toBe(true);
    expect(missingFields(exampleUnder('### `GET /api/assets`'), res.body)).toEqual([]);
  });

  it('shows GET /api/setup/status', async () => {
    const res = await request(app).get('/api/setup/status');

    expect(res.status).toBe(200);
    expect(missingFields(exampleUnder('### `GET /api/setup/status`'), res.body)).toEqual([]);
  });
});
