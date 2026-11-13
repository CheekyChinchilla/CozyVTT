/**
 * A Horror d100 sheet in the shape before 1.7.0 sent to the server is stored
 * in the rebuilt shape, whichever route it comes by: a character created or
 * saved, a template published or saved, a character file imported (the
 * browser sends the file's sheet to POST /api/characters). Nothing is stored
 * in the old shape: a save the conversion cannot make valid is refused, and a
 * save from a tab opened before the upgrade is refused with 409 when it says
 * what it loaded.
 *
 * The conversion record (`converted`): every save of a character keeps the
 * one stored, whoever saves and whatever the request sends for it, and never
 * writes one made from the request. Creating a character keeps the record its
 * own conversion wrote, or the one the request carries (a character file
 * exported from 1.7.0). A template takes none from a request; one stored in
 * the old shape keeps the record its own conversion gives, through every save.
 *
 * The conversion runs only for a character or template whose system is
 * Horror d100: a Flexible sheet keeps whatever keys it is sent, the old
 * sheet's among them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, createTestCampaign, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { HorrorD100SheetSchema } from '../../validators/game-systems/horrorD100Sheet.schema';
import { SHEET_LIST_MAX } from '../../validators/game-systems/sheetLimits';
import { toJson } from '../../utils/prisma-json';
import { getBlankTemplate } from '../../utils/character-templates';
import { convertHorrorD100Sheet } from '../horrorD100Sheet';

jest.setTimeout(60_000);

type Fields = Record<string, unknown>;

const FIXTURES = path.join(__dirname, '../__fixtures__/horror-d100-sheets');
/** Every fixture an older version could have stored as it is. */
const STORED_BY_A_VERSION = ['v1.3.0-detective', 'v1.5.0-blank', 'v1.6.0-detective-played', 'v1.6.0-example', 'v1.6.0-example-minimal', 'pre-1.3.0-player'];

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fixture(name: string): Fields {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
  if (!isFields(parsed)) throw new Error(`${name}.json does not hold a sheet`);
  return parsed;
}

function fields(value: unknown): Fields {
  if (!isFields(value)) throw new Error(`not an object: ${JSON.stringify(value)}`);
  return value;
}

/** The old sheet's keys, none of which a stored sheet may hold. */
const OLD_KEYS = ['investigatorName', 'occupation', 'derivedStats', 'combat', 'backstory', 'pulpTalents', 'spellsAndMythos'];

/** Checks a sheet is in the rebuilt shape, and gives it back. */
function rebuilt(data: unknown): Fields {
  const sheet = fields(data);
  expect(OLD_KEYS.filter((key) => key in sheet)).toEqual([]);
  const result = HorrorD100SheetSchema.safeParse(sheet);
  expect(result.success ? [] : result.error.issues).toEqual([]);
  return sheet;
}

const stored = async (id: string) => fields((await prisma.character.findUniqueOrThrow({ where: { id } })).data);
const storedTemplate = async (id: string) => fields((await prisma.characterTemplate.findUniqueOrThrow({ where: { id } })).data);

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

beforeAll(async () => {
  const ownerUser = await createTestUser({ displayName: 'Saves Owner' });
  const gmUser = await createTestUser({ displayName: 'Saves GM' });
  ownerId = ownerUser.id;
  gmId = gmUser.id;
  owner = await signIn(ownerUser.email);
  gm = await signIn(gmUser.email);
  campaignId = (await createTestCampaign(gmId, { name: 'Saves table', gameSystem: 'HORROR_D100' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: ownerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
});

afterAll(async () => {
  await prisma.characterTemplate.deleteMany({ where: { createdById: { in: [ownerId, gmId] } } });
  await prisma.campaign.deleteMany({ where: { ownerId: { in: [ownerId, gmId] } } });
  await cleanupUsers([ownerId, gmId]);
  await prisma.$disconnect();
});

/** A character of the owner's in the GM's campaign, stored as `data` is. */
async function storedCharacter(data: unknown): Promise<string> {
  const id = (await prisma.character.create({
    data: { userId: ownerId, campaignId, name: 'Stored', gameSystem: 'HORROR_D100', data: toJson(data) },
  })).id;
  await prisma.campaignMembership.update({
    where: { userId_campaignId: { userId: ownerId, campaignId } },
    data: { characterIds: { push: id } },
  });
  return id;
}

describe('a Horror d100 sheet in the shape before 1.7.0', () => {
  it.each(STORED_BY_A_VERSION)('is converted when a character is created from %s', async (name) => {
    const res = await owner.post('/api/characters').send({ name: 'Made old', gameSystem: 'HORROR_D100', data: fixture(name) });
    expect(res.status).toBe(201);
    const sheet = rebuilt(await stored(res.body.character.id));
    expect(fields(sheet.converted).from).toBe(1);
    expect(sheet.characterName).toBe('Made old');
    expect(rebuilt(res.body.character.data)).toEqual(sheet);
  });

  it('is converted when a character file a 1.6.0 instance exported is imported, its old system value and all', async () => {
    // What the browser sends for the file: its name, system and sheet.
    const res = await owner.post('/api/characters').send({ name: 'Dr. Ilse Varga', gameSystem: 'CALL_OF_CTHULHU_7E', data: fixture('v1.6.0-example') });
    expect(res.status).toBe(201);
    expect(res.body.character.gameSystem).toBe('HORROR_D100');
    const sheet = rebuilt(await stored(res.body.character.id));
    expect(fields(sheet.characteristics)).toMatchObject({ STR: 9, CHA: 13 });
    expect(fields(fields(sheet.converted).characteristics)).toMatchObject({ STR: 45, CHA: 65 });
  });

  it('is converted when a character is created in a Horror d100 campaign without naming a system', async () => {
    const res = await owner.post('/api/characters').send({ name: 'Inherited', campaignId, data: fixture('v1.6.0-example-minimal') });
    expect(res.status).toBe(201);
    expect(fields(rebuilt(await stored(res.body.character.id)).converted).from).toBe(1);
  });

  it('is converted when a character is saved with it, by its owner or the GM', async () => {
    for (const agent of [owner, gm]) {
      const id = await storedCharacter(getBlankTemplate('HORROR_D100').data);
      const res = await agent.put(`/api/characters/${id}`).send({ data: fixture('v1.6.0-detective-played') });
      expect(res.status).toBe(200);
      const sheet = rebuilt(await stored(id));
      // An update writes no record made from the request.
      expect(sheet).not.toHaveProperty('converted');
      expect(rebuilt(res.body.character.data).characterName).toBe(sheet.characterName);
    }
  });

  it('is converted when a template is published from it, and when a template is saved with it', async () => {
    const made = await owner.post('/api/character-templates').send({ name: 'Old template', gameSystem: 'CALL_OF_CTHULHU_7E', data: fixture('v1.3.0-detective') });
    expect(made.status).toBe(201);
    const sheet = rebuilt(await storedTemplate(made.body.id));
    expect(sheet.characterName).toBe(fixture('v1.3.0-detective').investigatorName);
    expect(sheet).not.toHaveProperty('playerName');
    // A template is everyone's starting point, so it keeps no character's originals.
    expect(sheet).not.toHaveProperty('converted');

    const blank = await owner.post('/api/character-templates').send({ name: 'New template', gameSystem: 'HORROR_D100', data: getBlankTemplate('HORROR_D100').data });
    expect(blank.status).toBe(201);
    const saved = await owner.put(`/api/character-templates/${blank.body.id}`).send({ data: fixture('v1.5.0-blank') });
    expect(saved.status).toBe(200);
    expect(rebuilt(await storedTemplate(blank.body.id))).not.toHaveProperty('converted');
  });

  it('is refused, and nothing stored, when its conversion is not a sheet the schema takes', async () => {
    const before = await prisma.character.count({ where: { userId: ownerId } });
    const res = await owner.post('/api/characters').send({ name: 'Broken', gameSystem: 'HORROR_D100', data: fixture('malformed') });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Character data does not match game system schema');
    expect(await prisma.character.count({ where: { userId: ownerId } })).toBe(before);

    const id = await storedCharacter(getBlankTemplate('HORROR_D100').data);
    const saved = await owner.put(`/api/characters/${id}`).send({ data: fixture('malformed') });
    expect(saved.status).toBe(400);
    expect(await stored(id)).toEqual(getBlankTemplate('HORROR_D100').data);
  });
});

describe('a Horror d100 character still stored in the shape before 1.7.0, moved to another campaign', () => {
  it('is stored converted, its record written and the GM\'s notes cleared', async () => {
    const old = fixture('v1.6.0-detective-played');
    expect(typeof old.notes).toBe('string');
    const id = await storedCharacter(old);
    const theirs = await createTestCampaign(ownerId, { name: 'Their table', gameSystem: 'HORROR_D100' });
    await prisma.campaignMembership.create({ data: { userId: ownerId, campaignId: theirs.id, role: 'GM', characterIds: [] } });

    const moved = await owner.post(`/api/characters/${id}/assign`).send({ campaignId: theirs.id });
    expect(moved.status).toBe(200);

    const sheet = rebuilt(await stored(id));
    expect(sheet.converted).toMatchObject({ from: 1 });
    expect(sheet).not.toHaveProperty('notes');
  });
});

describe('a save from a tab opened before the upgrade', () => {
  it('is refused with 409 when it says what it loaded, and leaves the converted sheet as it is', async () => {
    const id = await storedCharacter(fixture('v1.6.0-example'));
    const loadedAt = (await prisma.character.findUniqueOrThrow({ where: { id } })).updatedAt;
    // The conversion of the stored rows bumps updatedAt, as any write does.
    const { sheet } = convertHorrorD100Sheet(fixture('v1.6.0-example'), new Date());
    await prisma.character.update({ where: { id }, data: { data: toJson(sheet) } });
    const converted = await stored(id);

    const res = await owner.put(`/api/characters/${id}`).send({ data: fixture('v1.6.0-example'), updatedAt: loadedAt.toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHARACTER_CHANGED');
    expect(await stored(id)).toEqual(converted);
  });

  it('is converted when it says nothing of what it loaded, keeping the stored record', async () => {
    const id = await storedCharacter(convertHorrorD100Sheet(fixture('v1.6.0-example'), new Date('2026-11-12T08:00:00.000Z')).sheet);
    const record = (await stored(id)).converted;

    const res = await owner.put(`/api/characters/${id}`).send({ data: fixture('v1.6.0-detective-played') });
    expect(res.status).toBe(200);
    const sheet = rebuilt(await stored(id));
    expect(sheet.converted).toEqual(record);
  });
});

describe('the conversion record', () => {
  async function convertedCharacter(): Promise<{ id: string; record: unknown; sheet: Fields }> {
    const res = await owner.post('/api/characters').send({ name: 'Recorded', gameSystem: 'HORROR_D100', campaignId, data: fixture('v1.6.0-example') });
    expect(res.status).toBe(201);
    const sheet = await stored(res.body.character.id);
    return { id: res.body.character.id, record: sheet.converted, sheet };
  }

  it('is kept when a save leaves it out', async () => {
    const { id, record, sheet } = await convertedCharacter();
    const { converted: _left, ...without } = sheet;
    const res = await owner.put(`/api/characters/${id}`).send({ data: { ...without, profession: 'Retired' } });
    expect(res.status).toBe(200);
    expect(await stored(id)).toMatchObject({ profession: 'Retired', converted: record });
  });

  it('is not rewritten by a save that sends another, the owner\'s or the GM\'s', async () => {
    const { id, record, sheet } = await convertedCharacter();
    const forged = { from: 1, at: '1999-01-01T00:00:00.000Z', characteristics: { STR: 99 }, skills: [{ name: 'Cheating', value: 99 }], kept: ['x'.repeat(10_000)] };
    for (const agent of [owner, gm]) {
      const res = await agent.put(`/api/characters/${id}`).send({ data: { ...sheet, converted: forged } });
      expect(res.status).toBe(200);
      expect((await stored(id)).converted).toEqual(record);
      expect(res.body.character.data.converted).toEqual(record);
    }
  });

  it('is kept from the request that creates a character, as a character file exported from 1.7.0 carries it', async () => {
    const blank = getBlankTemplate('HORROR_D100').data;
    const carried = { from: 1, at: '2026-11-12T08:00:00.000Z', characteristics: { STR: 60 }, skills: [{ name: 'Charm', value: 40 }], kept: [] };
    const character = await owner.post('/api/characters').send({ name: 'Imported', gameSystem: 'HORROR_D100', data: { ...blank, converted: carried } });
    expect(character.status).toBe(201);
    expect((await stored(character.body.character.id)).converted).toEqual(carried);
  });

  it('is never written by an update from the request, when the stored sheet has none', async () => {
    const id = await storedCharacter(getBlankTemplate('HORROR_D100').data);
    const forged = { from: 1, at: 'then', characteristics: {}, skills: [], kept: [] };
    expect((await owner.put(`/api/characters/${id}`).send({ data: { ...getBlankTemplate('HORROR_D100').data, converted: forged } })).status).toBe(200);
    expect(await stored(id)).not.toHaveProperty('converted');

    // An old-shape body is converted, and its record dropped.
    const res = await owner.put(`/api/characters/${id}`).send({ data: fixture('v1.6.0-example') });
    expect(res.status).toBe(200);
    const sheet = rebuilt(await stored(id));
    expect(sheet.profession).toBe(fixture('v1.6.0-example').occupation);
    expect(sheet).not.toHaveProperty('converted');
  });

  it('stays on a stored template that was converted, whether a save leaves it out or sends another', async () => {
    // As the conversion of the stored sheets leaves a template an older version stored.
    const { sheet } = convertHorrorD100Sheet(fixture('v1.3.0-detective'), new Date());
    const id = (await prisma.characterTemplate.create({
      data: { id: `converted-template-${Date.now()}`, name: 'Converted template', gameSystem: 'HORROR_D100', data: toJson(sheet), createdById: ownerId },
    })).id;
    const record = (await storedTemplate(id)).converted;
    expect(fields(record).from).toBe(1);

    const served = await owner.get(`/api/character-templates/${id}`);
    expect(served.body.data.converted).toEqual(record);
    const { converted: _left, ...without } = fields(served.body.data);
    const saved = await owner.put(`/api/character-templates/${id}`).send({ data: { ...without, profession: 'Retired' } });
    expect(saved.status).toBe(200);
    expect(saved.body.data.converted).toEqual(record);
    expect(await storedTemplate(id)).toMatchObject({ profession: 'Retired', converted: record });

    const forged = { from: 1, at: 'then', characteristics: { STR: 99 }, skills: [], kept: ['forged'] };
    expect((await owner.put(`/api/character-templates/${id}`).send({ data: { ...without, converted: forged } })).status).toBe(200);
    expect((await storedTemplate(id)).converted).toEqual(record);
  });

  it('of a template still stored in the old shape is the one its conversion gives, when the template is saved', async () => {
    const id = (await prisma.characterTemplate.create({
      data: { id: `old-template-${Date.now()}`, name: 'Old template', gameSystem: 'HORROR_D100', data: toJson(fixture('v1.3.0-detective')), createdById: ownerId },
    })).id;
    const res = await owner.put(`/api/character-templates/${id}`).send({ data: getBlankTemplate('HORROR_D100').data });
    expect(res.status).toBe(200);
    const sheet = rebuilt(await storedTemplate(id));
    expect(fields(fields(sheet.converted).characteristics)).toMatchObject({ STR: 60 });
  });

  it('is never taken by a template from a request: not sent with it, not from a converted character saved as one', async () => {
    const blank = getBlankTemplate('HORROR_D100').data;
    const forged = { from: 1, at: 'then', characteristics: {}, skills: [], kept: [] };
    const template = await owner.post('/api/character-templates').send({ name: 'Fresh template', gameSystem: 'HORROR_D100', data: { ...blank, converted: forged } });
    expect(template.status).toBe(201);
    expect(await storedTemplate(template.body.id)).not.toHaveProperty('converted');
    expect(template.body.data).not.toHaveProperty('converted');

    // Save as template: the browser sends the character's sheet, record and all.
    const { sheet } = await convertedCharacter();
    expect(sheet).toHaveProperty('converted');
    const fromCharacter = await owner.post('/api/character-templates').send({ name: 'From a character', gameSystem: 'HORROR_D100', data: sheet });
    expect(fromCharacter.status).toBe(201);
    expect(await storedTemplate(fromCharacter.body.id)).not.toHaveProperty('converted');
    expect((await owner.put(`/api/character-templates/${fromCharacter.body.id}`).send({ data: sheet })).status).toBe(200);
    expect(await storedTemplate(fromCharacter.body.id)).not.toHaveProperty('converted');

    // A character made from the template, as the browser makes it, has none.
    const served = await owner.get(`/api/character-templates/${fromCharacter.body.id}`);
    const made = await owner.post('/api/characters').send({ name: 'From the template', gameSystem: 'HORROR_D100', data: served.body.data });
    expect(made.status).toBe(201);
    expect(await stored(made.body.character.id)).not.toHaveProperty('converted');
  });

  it('comes from the stored sheet when that is still in the old shape, whatever the save sends', async () => {
    const id = await storedCharacter(fixture('v1.6.0-example'));
    const blank = getBlankTemplate('HORROR_D100').data;
    const forged = { from: 1, at: 'then', characteristics: { STR: 1 }, skills: [], kept: [] };
    const res = await owner.put(`/api/characters/${id}`).send({ data: { ...blank, converted: forged } });
    expect(res.status).toBe(200);
    const record = fields((await stored(id)).converted);
    expect(fields(record.characteristics)).toMatchObject({ STR: 45, CHA: 65 });
  });
});

describe('a Flexible sheet holding keys the old Horror d100 sheet had', () => {
  const flexible = {
    investigatorName: 'Iris',
    occupation: 'Sailor',
    spellsAndMythos: { cthulhuMythos: 4 },
    characteristics: { APP: { regular: 60 } },
    sections: [{ id: 's1', title: 'Notes', type: 'text', value: 'Kept as it is.' }],
  };

  it('is stored as sent when a character is created or saved', async () => {
    const made = await owner.post('/api/characters').send({ name: 'Flexible', data: flexible });
    expect(made.status).toBe(201);
    expect(await stored(made.body.character.id)).toEqual(flexible);
    const changed = { ...flexible, occupation: 'Captain' };
    expect((await owner.put(`/api/characters/${made.body.character.id}`).send({ data: changed })).status).toBe(200);
    expect(await stored(made.body.character.id)).toEqual(changed);
  });

  it('is stored as sent when a template is published or saved', async () => {
    const made = await owner.post('/api/character-templates').send({ name: 'Flexible template', data: flexible });
    expect(made.status).toBe(201);
    expect(await storedTemplate(made.body.id)).toEqual(flexible);
    const changed = { ...flexible, occupation: 'Captain' };
    expect((await owner.put(`/api/character-templates/${made.body.id}`).send({ data: changed })).status).toBe(200);
    expect(await storedTemplate(made.body.id)).toEqual(changed);
  });
});

describe('a sheet whose conversion lengthens a list past 500 entries', () => {
  it('is stored, and can be saved again as it is', async () => {
    const old = fixture('v1.6.0-example');
    const skills = fields(old.skills);
    const row = (name: string) => ({ name, specialization: name, baseValue: 1, currentValue: 30, improvementChecked: false });
    const many = (label: string) => Array.from({ length: SHEET_LIST_MAX }, (_unused, i) => row(`${label} ${i}`));
    const firearms = fields(skills.firearms);
    const sheet = {
      ...old,
      skills: {
        ...skills,
        firearms: { ...firearms, custom: many('Gun') },
        customSkills: many('Craft'),
        charm: { baseValue: 15, currentValue: 40, improvementChecked: false },
        intimidate: { baseValue: 15, currentValue: 40, improvementChecked: false },
        survival: { baseValue: 10, currentValue: 30, improvementChecked: false, specialization: 'Desert' },
        artCraft: { baseValue: 5, currentValue: 30, improvementChecked: false, specialization: 'Painting' },
      },
    };
    const made = await owner.post('/api/characters').send({ name: 'Long lists', gameSystem: 'HORROR_D100', data: sheet });
    expect(made.status).toBe(201);
    const converted = fields(fields(await stored(made.body.character.id)).skills);
    expect((converted.firearm as unknown[]).length).toBe(SHEET_LIST_MAX + 3);
    expect((converted.own as unknown[]).length).toBe(SHEET_LIST_MAX + 4);

    const again = await owner.put(`/api/characters/${made.body.character.id}`).send({ data: made.body.character.data });
    expect(again.status).toBe(200);
  });
});
