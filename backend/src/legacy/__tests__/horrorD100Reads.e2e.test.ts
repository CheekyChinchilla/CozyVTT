/**
 * A Horror d100 sheet still stored in the shape before 1.7.0, as one is when
 * the conversion of the stored sheets has not run or did not finish, is
 * answered in the rebuilt shape by every route that answers a sheet, and
 * nothing is written by reading it: a character, its validation, a copy (a
 * new character, stored converted), the campaign roster's hit points and a
 * template. A Flexible sheet holding the old sheet's keys is answered as it
 * is stored.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, createTestCampaign, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { HorrorD100SheetSchema } from '../../validators/game-systems/horrorD100Sheet.schema';
import { toJson } from '../../utils/prisma-json';
import { convertHorrorD100Sheet } from '../horrorD100Sheet';

jest.setTimeout(60_000);

type Fields = Record<string, unknown>;

const FIXTURES = path.join(__dirname, '../__fixtures__/horror-d100-sheets');

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fixture(name: string): Fields {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
  if (!isFields(parsed)) throw new Error(`${name}.json does not hold a sheet`);
  return parsed;
}

/** Checks a sheet is in the rebuilt shape, and gives it back. */
function rebuilt(data: unknown): Fields {
  if (!isFields(data)) throw new Error('not a sheet');
  expect(['investigatorName', 'occupation', 'derivedStats', 'backstory'].filter((key) => key in data)).toEqual([]);
  const result = HorrorD100SheetSchema.safeParse(data);
  expect(result.success ? [] : result.error.issues).toEqual([]);
  return data;
}

const app = createTestApp();
let ownerId: string;
let gmId: string;
let owner: ReturnType<typeof request.agent>;
let gm: ReturnType<typeof request.agent>;
let campaignId: string;

async function signIn(email: string): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

/** A character of the owner's in the GM's campaign, stored as `data` is. */
async function storedCharacter(data: unknown, gameSystem: 'HORROR_D100' | null = 'HORROR_D100'): Promise<string> {
  const id = (await prisma.character.create({
    data: { userId: ownerId, campaignId: gameSystem ? campaignId : null, name: 'Stored old', gameSystem, data: toJson(data) },
  })).id;
  if (gameSystem) {
    await prisma.campaignMembership.update({
      where: { userId_campaignId: { userId: ownerId, campaignId } },
      data: { characterIds: { push: id } },
    });
  }
  return id;
}

const row = (id: string) => prisma.character.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  const ownerUser = await createTestUser({ displayName: 'Reads Owner' });
  const gmUser = await createTestUser({ displayName: 'Reads GM' });
  ownerId = ownerUser.id;
  gmId = gmUser.id;
  owner = await signIn(ownerUser.email);
  gm = await signIn(gmUser.email);
  campaignId = (await createTestCampaign(gmId, { name: 'Reads table', gameSystem: 'HORROR_D100' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: ownerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
});

afterAll(async () => {
  await prisma.characterTemplate.deleteMany({ where: { createdById: { in: [ownerId, gmId] } } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await cleanupUsers([ownerId, gmId]);
  await prisma.$disconnect();
});

describe('a Horror d100 character stored in the shape before 1.7.0', () => {
  it('is answered converted to its owner and the GM, the GM\'s notes to the GM alone, and stays as stored', async () => {
    const old = fixture('v1.6.0-detective-played');
    const id = await storedCharacter(old);
    const before = await row(id);

    const toOwner = await owner.get(`/api/characters/${id}`);
    expect(toOwner.status).toBe(200);
    const sheet = rebuilt(toOwner.body.character.data);
    expect(sheet.converted).toMatchObject({ from: 1 });
    expect(sheet).not.toHaveProperty('notes');

    const toGm = await gm.get(`/api/characters/${id}`);
    expect(rebuilt(toGm.body.character.data).notes).toBe(old.notes);

    expect(await row(id)).toEqual(before);
  });

  it('is validated as it is answered, and stays as stored', async () => {
    const id = await storedCharacter(fixture('v1.6.0-example'));
    const before = await row(id);
    const res = await owner.get(`/api/characters/${id}/validate`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isValid: true });
    expect(await row(id)).toEqual(before);
  });

  it('is copied converted, the original staying as stored', async () => {
    const id = await storedCharacter(fixture('v1.6.0-example'));
    const before = await row(id);
    const copy = await owner.post(`/api/characters/${id}/copy`);
    expect(copy.status).toBe(201);
    const stored = rebuilt((await row(copy.body.character.id)).data);
    expect(stored.characterName).toBe('Stored old (Copy)');
    expect(stored.converted).toMatchObject({ from: 1 });
    expect(await row(id)).toEqual(before);
  });

  it('gives the campaign roster its hit points on the new scale, and stays as stored', async () => {
    // CON 60 and SIZ 65 give 13; 12 of 7 on the old scale was 5 taken.
    const id = await storedCharacter({
      investigatorName: 'Roster',
      occupation: 'Scholar',
      era: '1920s',
      characteristics: { CON: { regular: 60, half: 30, fifth: 12 }, SIZ: { regular: 65, half: 32, fifth: 13 } },
      derivedStats: { hp: { maximum: 12, current: 7 } },
    });
    const before = await row(id);
    const res = await gm.get(`/api/campaigns/${campaignId}/characters`);
    expect(res.status).toBe(200);
    const listed = (res.body.roster as Array<{ characters: Array<{ id: string; hp: unknown }> }>)
      .flatMap((member) => member.characters)
      .find((character) => character.id === id);
    expect(listed?.hp).toEqual({ current: 8, max: 13, temp: 0 });
    expect(await row(id)).toEqual(before);
  });
});

describe('a Horror d100 template stored in the shape before 1.7.0', () => {
  it('is answered converted, with the record its conversion gives, and stays as stored', async () => {
    const id = (await prisma.characterTemplate.create({
      data: { id: `old-template-${Date.now()}`, name: 'Old template', gameSystem: 'HORROR_D100', data: toJson(fixture('v1.3.0-detective')), createdById: ownerId },
    })).id;
    const before = await prisma.characterTemplate.findUniqueOrThrow({ where: { id } });
    const res = await owner.get(`/api/character-templates/${id}`);
    expect(res.status).toBe(200);
    const sheet = rebuilt(res.body.data);
    expect(sheet.characterName).toBe(fixture('v1.3.0-detective').investigatorName);
    expect(sheet.converted).toMatchObject({ from: 1, characteristics: { STR: 60 } });
    expect(sheet).not.toHaveProperty('playerName');
    expect(await prisma.characterTemplate.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });
});

describe('a Horror d100 template from before 1.3.0 holding two player names', () => {
  it('is answered with neither, in the sheet or among what its record kept, stored or converted at start', async () => {
    const old = { ...fixture('pre-1.3.0-player'), player: 'Robin Vale', playerName: 'Jo Marsh' };
    const id = (await prisma.characterTemplate.create({
      data: { id: `two-players-${Date.now()}`, name: 'Two players', gameSystem: 'HORROR_D100', data: toJson(old), createdById: ownerId },
    })).id;
    const kept = (sheet: unknown) => (isFields(sheet) && isFields(sheet.converted) && Array.isArray(sheet.converted.kept) ? sheet.converted.kept : undefined);

    const answered = await owner.get(`/api/character-templates/${id}`);
    expect(JSON.stringify(answered.body)).not.toMatch(/Robin Vale|Jo Marsh/);
    expect(kept(answered.body.data)).toEqual([]);

    // The stored row keeps the name once converted, as a character's record does; the answer still leaves it out.
    const converted = convertHorrorD100Sheet(old, new Date()).sheet;
    expect(kept(converted)).toEqual(['player: "Robin Vale"']);
    await prisma.characterTemplate.update({ where: { id }, data: { data: toJson(converted) } });
    const again = await owner.get(`/api/character-templates/${id}`);
    expect(JSON.stringify(again.body)).not.toMatch(/Robin Vale|Jo Marsh/);
    expect(kept(again.body.data)).toEqual([]);
    const listed = await owner.get('/api/character-templates');
    expect(JSON.stringify(listed.body)).not.toMatch(/Robin Vale|Jo Marsh/);
  });
});

describe('a Flexible character holding keys the old Horror d100 sheet had', () => {
  it('is answered as it is stored', async () => {
    const flexible = { investigatorName: 'Iris', occupation: 'Sailor', derivedStats: { luck: { score: 50 } } };
    const id = await storedCharacter(flexible, null);
    const res = await owner.get(`/api/characters/${id}`);
    expect(res.body.character.data).toEqual(flexible);
    expect((await owner.post(`/api/characters/${id}/copy`)).body.character.data).toEqual(flexible);
  });
});
