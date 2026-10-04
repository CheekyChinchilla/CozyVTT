/**
 * GET /api/characters/:id/validate answers what the sheet schema says.
 *
 * The route called the validator and discarded its result, so every character
 * came back `isValid: true`. The write routes were never affected: they check
 * the result and refuse a bad sheet. This pins the read-only route to the
 * same answer, in the documented shape.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { getBlankTemplate } from '../../utils/character-templates';
import { GameSystem } from '../../game-systems';
import { toJson } from '../../utils/prisma-json';

const app = createTestApp();
let ownerId: string;
let otherId: string;
let owner: ReturnType<typeof request.agent>;
let other: ReturnType<typeof request.agent>;

type Verdict = { isValid: boolean; errors?: Array<{ path: string; message: string; code: string }> };

beforeAll(async () => {
  const stamp = Date.now();
  const o = await createTestUser({ email: `validate-owner-${stamp}@test.cozyvtt.local`, displayName: 'Owner' });
  const x = await createTestUser({ email: `validate-other-${stamp}@test.cozyvtt.local`, displayName: 'Other' });
  ownerId = o.id;
  otherId = x.id;
  owner = request.agent(app);
  other = request.agent(app);
  expect((await owner.post('/api/auth/login').send({ email: o.email, password: TEST_PASSWORD })).status).toBe(200);
  expect((await other.post('/api/auth/login').send({ email: x.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupUsers([ownerId, otherId]);
  await prisma.$disconnect();
});

// A deep copy: the template's nested objects are shared, and one case below
// corrupts a nested field.
const blank = (): Record<string, unknown> => JSON.parse(JSON.stringify(getBlankTemplate(GameSystem.DND_5E).data));

async function createCharacter(): Promise<string> {
  const res = await owner.post('/api/characters').send({ name: 'Checked', gameSystem: 'DND_5E', data: blank() });
  expect(res.status).toBe(201);
  return res.body.character.id;
}

it('answers isValid true for a sheet the schema accepts', async () => {
  const id = await createCharacter();
  const res = await owner.get(`/api/characters/${id}/validate`);
  expect(res.status).toBe(200);
  expect(res.body as Verdict).toEqual({ isValid: true });
});

it('answers isValid false and names the field for a sheet it does not', async () => {
  const id = await createCharacter();
  // Written straight to the database: the write routes would refuse this.
  const sheet = blank();
  const stats = sheet.stats as Record<string, unknown>;
  stats.strength = { score: 'high', modifier: 0 };
  await prisma.character.update({ where: { id }, data: { data: toJson(sheet) } });

  const res = await owner.get(`/api/characters/${id}/validate`);
  expect(res.status).toBe(200);
  const verdict = res.body as Verdict;
  expect(verdict.isValid).toBe(false);
  expect(verdict.errors?.map((e) => e.path)).toContain('stats.strength.score');
  expect(verdict.errors?.find((e) => e.path === 'stats.strength.score')?.code).toBe('invalid_type');
});

it('will not validate another user\'s character', async () => {
  const id = await createCharacter();
  expect((await other.get(`/api/characters/${id}/validate`)).status).toBe(403);
});

it('says so when the character has no game system', async () => {
  const id = await createCharacter();
  await prisma.character.update({ where: { id }, data: { gameSystem: null } });
  const res = await owner.get(`/api/characters/${id}/validate`);
  expect(res.status).toBe(400);
  expect((res.body as Verdict).isValid).toBe(false);
  expect((res.body as Verdict).errors?.[0]?.code).toBe('no_game_system');
});
