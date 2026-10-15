/**
 * What the instance's default theme may be set to.
 *
 * PUT /api/admin/settings stored customThemeColors as it came, while a
 * user's own custom colours were checked. The instance theme is painted for
 * every visitor, the sign-in page included, so a malformed value (one colour
 * missing, a word for a colour) broke the page for everyone, and a null
 * answered 500. The theme and font names were not checked either. All three
 * are now checked against the same lists and colour format as a user's
 * preferences, and a null clears the custom colours.
 *
 * The settings row is shared by every test file, so the values this file
 * changes are put back when it ends.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { PlatformRole, Prisma } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

let adminId: string;
let admin: ReturnType<typeof request.agent>;
let before: { themeId: string; fontId: string; customThemeColors: Prisma.JsonValue } | null = null;

const COLOURS = { primary: '#4A5D4E', accent: '#D4A574', background: '#FFF9E6', text: '#1F2937' };

const save = (body: Record<string, unknown>) => admin.put('/api/admin/settings').send(body);

beforeAll(async () => {
  const user = await createTestUser({ role: PlatformRole.ADMIN, displayName: 'Theme Admin' });
  adminId = user.id;
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  const res = await admin.get('/api/admin/settings');
  before = { themeId: res.body.settings.themeId, fontId: res.body.settings.fontId, customThemeColors: res.body.settings.customThemeColors };
});

afterAll(async () => {
  try {
    if (before) {
      await prisma.systemSettings.updateMany({
        data: {
          themeId: before.themeId,
          fontId: before.fontId,
          customThemeColors: before.customThemeColors === null ? Prisma.DbNull : (before.customThemeColors as Prisma.InputJsonValue),
        },
      });
    }
    await cleanupUsers([adminId]);
  } finally {
    await prisma.$disconnect();
  }
});

describe('PUT /api/admin/settings customThemeColors', () => {
  it('stores four hex colours', async () => {
    const res = await save({ themeId: 'custom', customThemeColors: COLOURS });
    expect(res.status).toBe(200);
    expect(res.body.settings.customThemeColors).toEqual(COLOURS);
    expect((await request(app).get('/api/auth/appearance')).body.customThemeColors).toEqual(COLOURS);
  });

  it('clears them with null', async () => {
    await save({ customThemeColors: COLOURS });
    const res = await save({ customThemeColors: null });
    expect(res.status).toBe(200);
    expect(res.body.settings.customThemeColors).toBeNull();
  });

  it.each([
    ['a colour missing', { primary: '#FFFFFF' }],
    ['a colour given as a word', { ...COLOURS, background: 'red' }],
    ['a colour that is not a colour', { ...COLOURS, text: '#FFF; background: url(https://example.com/x)' }],
    ['a short hex colour', { ...COLOURS, accent: '#FFF' }],
    ['a field the theme does not have', { ...COLOURS, extra: '#000000' }],
    ['text', 'pink'],
  ])('refuses %s, and keeps what was stored', async (_label, value) => {
    await save({ customThemeColors: COLOURS });
    const res = await save({ customThemeColors: value });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect((await admin.get('/api/admin/settings')).body.settings.customThemeColors).toEqual(COLOURS);
  });
});

describe('PUT /api/admin/settings theme and font', () => {
  it('accepts a theme and a font the app has', async () => {
    const res = await save({ themeId: 'ocean-depths', fontId: 'medieval' });
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({ themeId: 'ocean-depths', fontId: 'medieval' });
  });

  it('refuses a theme the app does not have', async () => {
    expect((await save({ themeId: 'no-such-theme' })).status).toBe(400);
  });

  it('refuses a font the app does not have', async () => {
    expect((await save({ fontId: 'comic-sans' })).status).toBe(400);
  });
});
