/**
 * A token's picture is a token picture, wherever a request names one: a
 * token on a map, a token template, a creature, a character and a character
 * template.
 *
 * The reference check asked only whether the caller could read the asset an
 * address named, never what kind of asset it was, and an address names an
 * asset by its id whatever folder it gives. A token could then be given a
 * map picture, an animated one of up to 200 million pixels across its
 * frames, past the 50 million a token picture may be, or a document, a sound
 * file or an avatar.
 *
 * Every route that takes a token's picture now asks for an asset uploaded as
 * a token picture, as a map's picture must be a map picture. A record stored
 * before with another asset as its picture keeps it, and an edit that sends
 * that picture back unchanged still saves.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-token-picture-type-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { randomUUID } from 'crypto';
import request from 'supertest';
import { AssetType, GameSystem } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { getBlankCharacterTemplate } from '../../validators/game-systems';
import { GameSystem as AppGameSystem } from '../../game-systems';

const app = createTestApp();

const NOT_A_TOKEN_PICTURE = 'The token image must be a token picture from the asset library.';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

let gmId: string;
let campaignId: string;
let otherCampaignId: string;
let mapId: string;
let gm: ReturnType<typeof request.agent>;
const assetIds: string[] = [];

const commoner = { ac: 10, hpMax: 4, speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10 }, challengeRating: '0' };
const fifthEditionSheet = { ...(getBlankCharacterTemplate(AppGameSystem.FIFTH_EDITION) as Record<string, unknown>), characterName: 'Picture Hero' };

/**
 * A global asset the GM uploaded, so every read check passes, the character
 * template's included, and only the asset's type is in question.
 */
async function makeAsset(type: AssetType): Promise<string> {
  const filename = `${type.toLowerCase()}-${randomUUID()}.png`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, PNG);
  const asset = await prisma.asset.create({
    data: { type, scope: 'GLOBAL', uploadedById: gmId, filename, originalName: filename, mimeType: 'image/png', fileSize: PNG.length, filePath, name: filename },
  });
  assetIds.push(asset.id);
  return asset.id;
}

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Token Picture GM' });
  gmId = user.id;
  campaignId = (await createTestCampaign(gmId, { name: 'Token picture types' })).id;
  otherCampaignId = (await createTestCampaign(gmId, { name: 'Token picture copies' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: gmId, campaignId: otherCampaignId, role: 'GM', characterIds: [] },
    ],
  });
  const mapPicture = await makeAsset('MAP');
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Hall', imageUrl: `/api/assets/maps/${mapPicture}`, baseLayerUrl: `/api/assets/maps/${mapPicture}`,
      width: 20, height: 20, gridSize: 50, annotations: [], tokens: [],
    },
  })).id;
  gm = request.agent(app);
  expect((await gm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.tokenTemplate.deleteMany({ where: { campaignId: { in: [campaignId, otherCampaignId] } } });
  await prisma.creatureTemplate.deleteMany({ where: { campaignId } });
  await prisma.character.deleteMany({ where: { userId: gmId } });
  await prisma.characterTemplate.deleteMany({ where: { createdById: gmId } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanupCampaigns([campaignId, otherCampaignId]);
  await cleanupUsers([gmId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

const at = (p: string) => `/api/campaigns/${campaignId}${p}`;

/** A token placed straight into the map, as an older release or a direct write may have stored it. */
async function storedToken(imageUrl: string): Promise<string> {
  const id = randomUUID();
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
  const tokens = Array.isArray(map.tokens) ? map.tokens : [];
  await prisma.map.update({
    where: { id: mapId },
    data: { tokens: [...tokens, { id, name: 'Stored', imageUrl, position: { x: 3, y: 3 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, rotation: 0, conditions: [], metadata: {}, type: 'npc' }] },
  });
  return id;
}

async function storedTokenPicture(tokenId: string): Promise<unknown> {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
  const tokens = Array.isArray(map.tokens) ? map.tokens : [];
  const token = tokens.find((t) => t !== null && typeof t === 'object' && !Array.isArray(t) && t.id === tokenId);
  return token !== null && typeof token === 'object' && !Array.isArray(token) ? token.imageUrl : undefined;
}

const storedTemplate = async (imageUrl: string | null) => (await prisma.tokenTemplate.create({
  data: { id: randomUUID(), campaignId, createdById: gmId, name: 'Stored', imageUrl, type: 'npc', displayMode: 'pog', size: { width: 1, height: 1 } },
})).id;
const storedCreature = async (imageUrl: string | null) => (await prisma.creatureTemplate.create({
  data: { campaignId, createdById: gmId, name: 'Stored', imageUrl, statBlock: commoner },
})).id;
const storedCharacter = async (tokenImageUrl: string | null) => (await prisma.character.create({
  data: { userId: gmId, name: 'Stored', tokenImageUrl, data: {} },
})).id;
const storedCharacterTemplate = async (tokenImageUrl: string | null) => (await prisma.characterTemplate.create({
  data: { name: 'Stored', gameSystem: GameSystem.FIFTH_EDITION, tokenImageUrl, data: fifthEditionSheet, createdById: gmId },
})).id;

/**
 * Each request that names a token's picture, given the address to send, and
 * how to read back what the record it writes holds (null when it wrote none).
 */
const WRITES: Array<[string, (address: string) => Promise<{ res: request.Response; stored: () => Promise<unknown> }>]> = [
  ['placing a token', async (a) => {
    const res = await gm.post(at(`/maps/${mapId}/tokens`)).send({ name: 'Imp', position: { x: 1, y: 1 }, imageUrl: a });
    return { res, stored: async () => (res.body.token ? storedTokenPicture(res.body.token.id) : null) };
  }],
  ['editing a token', async (a) => {
    const id = await storedToken('');
    const res = await gm.put(at(`/maps/${mapId}/tokens/${id}`)).send({ imageUrl: a });
    return { res, stored: () => storedTokenPicture(id) };
  }],
  ['a new token template', async (a) => {
    const res = await gm.post(at('/token-templates')).send({ name: 'Imp', imageUrl: a });
    return { res, stored: async () => (res.body.id ? (await prisma.tokenTemplate.findUniqueOrThrow({ where: { id: res.body.id } })).imageUrl : null) };
  }],
  ['editing a token template', async (a) => {
    const id = await storedTemplate(null);
    const res = await gm.put(at(`/token-templates/${id}`)).send({ imageUrl: a });
    return { res, stored: async () => (await prisma.tokenTemplate.findUniqueOrThrow({ where: { id } })).imageUrl };
  }],
  ['Save as Template', async (a) => {
    const res = await gm.post(at('/token-templates/from-token')).send({ name: 'Imp', imageUrl: a });
    return { res, stored: async () => (res.body.id ? (await prisma.tokenTemplate.findUniqueOrThrow({ where: { id: res.body.id } })).imageUrl : null) };
  }],
  ['copying a token template to another campaign', async (a) => {
    const id = await storedTemplate(a);
    const res = await gm.post(at(`/token-templates/${id}/copy-to/${otherCampaignId}`));
    return { res, stored: async () => (await prisma.tokenTemplate.findFirst({ where: { campaignId: otherCampaignId, imageUrl: { not: null } }, orderBy: { createdAt: 'desc' } }))?.imageUrl ?? null };
  }],
  ['a new creature', async (a) => {
    const res = await gm.post(at('/creatures')).send({ name: 'Imp', statBlock: commoner, imageUrl: a });
    return { res, stored: async () => (res.body.id ? (await prisma.creatureTemplate.findUniqueOrThrow({ where: { id: res.body.id } })).imageUrl : null) };
  }],
  // A creature stored before the rule may hold another kind of picture; its
  // copy is a new record, held to the rule as a template's copy is.
  ['duplicating a creature', async (a) => {
    const id = await storedCreature(a);
    const res = await gm.post(at(`/creatures/${id}/duplicate`));
    return { res, stored: async () => (res.body.id ? (await prisma.creatureTemplate.findUniqueOrThrow({ where: { id: res.body.id } })).imageUrl : null) };
  }],
  ['editing a creature', async (a) => {
    const id = await storedCreature(null);
    const res = await gm.put(at(`/creatures/${id}`)).send({ imageUrl: a });
    return { res, stored: async () => (await prisma.creatureTemplate.findUniqueOrThrow({ where: { id } })).imageUrl };
  }],
  ['a new character', async (a) => {
    const res = await gm.post('/api/characters').send({ name: 'Imp', data: {}, tokenImageUrl: a });
    const id = res.body.character?.id;
    return { res, stored: async () => (id ? (await prisma.character.findUniqueOrThrow({ where: { id } })).tokenImageUrl : null) };
  }],
  ['editing a character', async (a) => {
    const id = await storedCharacter(null);
    const res = await gm.put(`/api/characters/${id}`).send({ tokenImageUrl: a });
    return { res, stored: async () => (await prisma.character.findUniqueOrThrow({ where: { id } })).tokenImageUrl };
  }],
  ['a new character template', async (a) => {
    const res = await gm.post('/api/character-templates').send({ name: 'Imp', gameSystem: GameSystem.FIFTH_EDITION, data: fifthEditionSheet, tokenImageUrl: a });
    return { res, stored: async () => (res.body.id ? (await prisma.characterTemplate.findUniqueOrThrow({ where: { id: res.body.id } })).tokenImageUrl : null) };
  }],
  ['editing a character template', async (a) => {
    const id = await storedCharacterTemplate(null);
    const res = await gm.put(`/api/character-templates/${id}`).send({ tokenImageUrl: a });
    return { res, stored: async () => (await prisma.characterTemplate.findUniqueOrThrow({ where: { id } })).tokenImageUrl };
  }],
];

const NOT_TOKEN_PICTURES: AssetType[] = ['MAP', 'AVATAR', 'DOCUMENT', 'AUDIO', 'OTHER'];

describe('a token picture that is not a token picture', () => {
  describe.each(WRITES)('is refused by %s', (_route, write) => {
    it.each(NOT_TOKEN_PICTURES)('when it is a %s asset, by its bare id or under the tokens folder', async (type) => {
      const id = await makeAsset(type);
      for (const address of [id, `/api/assets/tokens/${id}`]) {
        const { res, stored } = await write(address);
        expect(res.body.message).toBe(NOT_A_TOKEN_PICTURE);
        expect(res.status).toBe(400);
        expect(await stored()).toBeFalsy();
      }
    });
  });

  it.each(WRITES)('is refused by %s under its own folder too', async (_route, write) => {
    const id = await makeAsset('MAP');
    const { res } = await write(`/api/assets/maps/${id}`);
    expect(res.body.message).toBe(NOT_A_TOKEN_PICTURE);
    expect(res.status).toBe(400);
  });
});

describe('a token picture uploaded as one', () => {
  it.each(WRITES)('is taken by %s', async (_route, write) => {
    const id = await makeAsset('TOKEN');
    const { res, stored } = await write(id);
    expect(res.status).toBeLessThan(300);
    expect(await stored()).toBe(`/api/assets/tokens/${id}`);
  });
});

describe('a record stored before with another kind of asset as its picture', () => {
  let storedUrl: string;
  beforeAll(async () => {
    storedUrl = `/api/assets/maps/${await makeAsset('MAP')}`;
  });

  it('keeps it on a token through an edit that sends it back unchanged', async () => {
    const id = await storedToken(storedUrl);
    const res = await gm.put(at(`/maps/${mapId}/tokens/${id}`)).send({ name: 'Renamed', imageUrl: storedUrl });
    expect(res.status).toBe(200);
    expect(await storedTokenPicture(id)).toBe(storedUrl);
  });

  it('keeps it on a token template', async () => {
    const id = await storedTemplate(storedUrl);
    expect((await gm.put(at(`/token-templates/${id}`)).send({ name: 'Renamed', imageUrl: storedUrl })).status).toBe(200);
  });

  it('keeps it on a creature', async () => {
    const id = await storedCreature(storedUrl);
    expect((await gm.put(at(`/creatures/${id}`)).send({ name: 'Renamed', imageUrl: storedUrl })).status).toBe(200);
  });

  it('keeps it on a character', async () => {
    const id = await storedCharacter(storedUrl);
    expect((await gm.put(`/api/characters/${id}`).send({ name: 'Renamed', tokenImageUrl: storedUrl })).status).toBe(200);
  });

  it('keeps it on a character template', async () => {
    const id = await storedCharacterTemplate(storedUrl);
    expect((await gm.put(`/api/character-templates/${id}`).send({ name: 'Renamed', tokenImageUrl: storedUrl })).status).toBe(200);
  });

  it('can still be cleared from a token, a template, a creature and a character', async () => {
    const token = await storedToken(storedUrl);
    expect((await gm.put(at(`/maps/${mapId}/tokens/${token}`)).send({ imageUrl: '' })).status).toBe(200);
    expect((await gm.put(at(`/token-templates/${await storedTemplate(storedUrl)}`)).send({ imageUrl: null })).status).toBe(200);
    expect((await gm.put(at(`/creatures/${await storedCreature(storedUrl)}`)).send({ imageUrl: null })).status).toBe(200);
    expect((await gm.put(`/api/characters/${await storedCharacter(storedUrl)}`).send({ tokenImageUrl: null })).status).toBe(200);
  });
});
