/**
 * GET /api/auth/registration-status tells the sign-in page whether to offer
 * Register. Anyone may ask, signed in or not.
 *
 * Before the first account exists registration is open whatever the setting
 * says, so the setup wizard's admin can be made. After that it is the
 * instance's Allow Registration setting. When the answer cannot be read, the
 * link is hidden.
 *
 * The user count and the settings row are stood in for: the database is
 * shared with every other test file, which has accounts in it and reads the
 * real setting.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma as appPrisma } from '../../config/database';
import { getSystemSettings } from '../../services/systemSettings';

const app = createTestApp();

type Settings = Awaited<ReturnType<typeof getSystemSettings>>;
let settings: Settings;

beforeAll(async () => {
  settings = await getSystemSettings();
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await appPrisma.$disconnect();
});

/** The instance's settings as stored, with Allow Registration as given. */
function registration(allow: boolean) {
  jest.spyOn(appPrisma.systemSettings, 'findFirst').mockResolvedValue({ ...settings, allowRegistration: allow } as never);
}

describe('GET /api/auth/registration-status', () => {
  it('is open before the first account exists, whatever the setting says', async () => {
    registration(false);
    jest.spyOn(appPrisma.user, 'count').mockResolvedValue(0);

    const res = await request(app).get('/api/auth/registration-status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allowRegistration: true });
  });

  it.each([true, false])('follows the Allow Registration setting once accounts exist (%s)', async (allow) => {
    registration(allow);
    jest.spyOn(appPrisma.user, 'count').mockResolvedValue(3);

    const res = await request(app).get('/api/auth/registration-status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allowRegistration: allow });
  });

  it('hides Register when the database cannot be read', async () => {
    registration(true);
    jest.spyOn(appPrisma.user, 'count').mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/api/auth/registration-status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allowRegistration: false });
  });
});
