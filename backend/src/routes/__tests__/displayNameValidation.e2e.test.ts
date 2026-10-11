/**
 * A display name is checked on the server wherever one is set.
 *
 * Other members see it in the roster, chat and dice log, so a blank one, one
 * the length of a document, or a value that is not text at all has to be
 * refused by the server, not only by the forms that happen to send it.
 * Registration and a profile edit apply the same rule: trimmed, then 1 to 50
 * characters, the limit the profile page already shows.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

jest.mock('../../services/systemSettings', () => ({
  getSystemSettings: jest.fn().mockResolvedValue({
    id: 'test-settings',
    setupCompleted: true,
    instanceName: 'CozyVTT Test',
    timezone: 'UTC',
    allowRegistration: true,
    requireAdminApproval: false,
  }),
  getAppearanceSettings: jest.fn(),
  isSetupCompleted: jest.fn().mockResolvedValue(true),
  updateSystemSettings: jest.fn(),
  markSetupCompleted: jest.fn(),
  hasUsers: jest.fn().mockResolvedValue(true),
}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ email: `dname-owner-${stamp}@test.cozyvtt.local`, displayName: 'Owner' });
  userId = user.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  const rows = await prisma.user.findMany({
    where: { AND: [{ email: { startsWith: 'dname-' } }, { email: { contains: `-${stamp}@` } }] },
    select: { id: true },
  });
  await cleanupUsers([userId, ...rows.map((r) => r.id)]);
  await prisma.$disconnect();
});

describe('registration', () => {
  const register = (label: string, displayName: unknown) =>
    request(app)
      .post('/api/auth/register')
      .send({ email: `dname-${label}-${stamp}@test.cozyvtt.local`, password: TEST_PASSWORD, displayName });

  it('refuses a name that is only spaces', async () => {
    const res = await register('blank', '    ');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/display name/i);
  });

  it('refuses a name longer than 50 characters', async () => {
    const res = await register('long', 'x'.repeat(51));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/display name/i);
  });

  it('refuses a name that is not text, saying so', async () => {
    const res = await register('number', 12345);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/display name/i);
  });

  it('stores a valid name trimmed', async () => {
    const res = await register('ok', '  Merric  ');
    expect(res.status).toBe(201);
    expect(res.body.user.displayName).toBe('Merric');
  });

  it('stores a name without bidirectional overrides, zero-width or control characters', async () => {
    // U+202E turns the rest of the line round when it is shown.
    const res = await register('bidi', 'Mal\u202Elory\u200B\u2066\u0007');
    expect(res.status).toBe(201);
    expect(res.body.user.displayName).toBe('Mallory');
  });

  it('refuses a name made only of invisible characters', async () => {
    const res = await register('invisible', '\u200B\u200C\u200D\u2060\uFEFF');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Display name is required');
  });

  it('stores emoji sequences and subdivision flags byte for byte', async () => {
    // A family emoji (four people joined by U+200D) and the Scotland flag
    // (a black flag, the tags g, b, s, c, t and the cancel tag).
    const name = 'Morag \u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466} \u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
    const res = await register('emoji', name);
    expect(res.status).toBe(201);
    const row = await prisma.user.findUnique({ where: { id: res.body.user.id }, select: { displayName: true } });
    expect(Buffer.from(row?.displayName ?? '', 'utf8')).toEqual(Buffer.from(name, 'utf8'));
  });

  it('stores a joiner between two Latin letters without it', async () => {
    const res = await register('joiner', 'Ali\u200Dce');
    expect(res.status).toBe(201);
    expect(res.body.user.displayName).toBe('Alice');
  });

  it('stores an accented name in one form, however it was typed', async () => {
    // "e" followed by a combining acute accent, and the single character for e-acute.
    const res = await register('nfc', 'Rene\u0301e');
    expect(res.status).toBe(201);
    expect(res.body.user.displayName).toBe('Ren\u00E9e');
  });
});

describe('PUT /api/users/:id', () => {
  it('refuses a name that is only spaces', async () => {
    const res = await agent.put(`/api/users/${userId}`).send({ displayName: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/display name/i);
  });

  it('refuses a name longer than 50 characters', async () => {
    const res = await agent.put(`/api/users/${userId}`).send({ displayName: 'y'.repeat(51) });
    expect(res.status).toBe(400);
  });

  it('refuses a name that is not text as a bad request', async () => {
    const res = await agent.put(`/api/users/${userId}`).send({ displayName: 42 });
    expect(res.status).toBe(400);
  });

  it('leaves the stored name alone when it refuses', async () => {
    const row = await prisma.user.findUnique({ where: { id: userId } });
    expect(row?.displayName).toBe('Owner');
  });

  it('strips a right-to-left override from a new name', async () => {
    const res = await agent.put(`/api/users/${userId}`).send({ displayName: 'Dungeon\u202E Master' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Dungeon Master');
  });

  it('accepts a 50-character name and stores it trimmed', async () => {
    const name = 'z'.repeat(50);
    const res = await agent.put(`/api/users/${userId}`).send({ displayName: `  ${name}  ` });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe(name);
  });
});
